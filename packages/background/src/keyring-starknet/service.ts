import { Env } from "@keplr-wallet/router";
import { ChainsService } from "../chains";
import { KeyRingService } from "../keyring";
import { Buffer } from "buffer/";
import { TokenERC20Service } from "../token-erc20";
import { WatchAssetParameters } from "@keplr-wallet/types";
import { getBasicAccessPermissionType, PermissionService } from "../permission";
import {
  CairoUint256,
  Call,
  InvocationsSignerDetails,
  TypedData as StarknetTypedData,
  typedData as starknetTypedDataUtils,
  hash as starknetHashUtils,
  transaction as starknetTransactionUtils,
  V2InvocationsSignerDetails,
  V3InvocationsSignerDetails,
  DeployAccountSignerDetails,
  CallData,
  V2DeployAccountSignerDetails,
  V3DeployAccountSignerDetails,
  DeclareSignerDetails,
  V2DeclareSignerDetails,
  V3DeclareSignerDetails,
  SignerInterface,
  Signature,
  TypedData,
  ProviderInterface,
  RpcProvider,
} from "starknet";
import { InteractionService } from "../interaction";
import { simpleFetch } from "@keplr-wallet/simple-fetch";
import { AccountImpl } from "./account-impl";

export class KeyRingStarknetService {
  constructor(
    protected readonly chainsService: ChainsService,
    public readonly keyRingService: KeyRingService,
    protected readonly permissionService: PermissionService,
    protected readonly tokenERC20Service: TokenERC20Service,
    protected readonly interactionService: InteractionService
  ) {}

  async init() {
    // TODO: ?
  }

  generateAccountInterface(
    env: Env,
    origin: string,
    address: string
  ): AccountImpl {
    return new AccountImpl(
      this.generateProviderInterface(env, origin),
      address,
      this.generateSignerInterface(env, origin),
      "1"
    );
  }

  generateSignerInterface(env: Env, origin: string): SignerInterface {
    return new SignerInterfaceImpl(
      env,
      origin,
      this.generateProviderInterface(env, origin),
      this.keyRingService,
      this.permissionService,
      this
    );
  }

  generateProviderInterface(_env: Env, origin: string): ProviderInterface {
    const chainId = this.permissionService.getCurrentChainIdForStarknet(origin);
    if (!chainId) {
      throw new Error("Chain id is not set");
    }
    const modularChainInfo =
      this.chainsService.getModularChainInfoOrThrow(chainId);
    if (!("starknet" in modularChainInfo)) {
      throw new Error("Chain is not a starknet chain");
    }
    return new RpcProvider({
      nodeUrl: modularChainInfo.starknet.rpc,
    });
  }

  async getStarknetKeySelected(chainId: string): Promise<{
    name: string;
    hexAddress: string;
    pubKey: Uint8Array;
    address: Uint8Array;
  }> {
    return await this.getStarknetKey(
      this.keyRingService.selectedVaultId,
      chainId
    );
  }

  async getStarknetKey(
    vaultId: string,
    chainId: string
  ): Promise<{
    name: string;
    hexAddress: string;
    pubKey: Uint8Array;
    address: Uint8Array;
  }> {
    const chainInfo = this.chainsService.getModularChainInfoOrThrow(chainId);
    if (!("starknet" in chainInfo)) {
      throw new Error("Chain is not a starknet chain");
    }
    const pubKey = await this.keyRingService.getPubKey(chainId, vaultId);

    const salt = Buffer.from("11", "hex");
    const classHash = Buffer.from(
      "02203673e728fa07de1c2ea60405399ffefaf875f1b7ae54e747659e1e216d94",
      "hex"
    );
    // TODO: salt를 어떻게 할지 생각한다...
    //       class hash의 경우도 생각해야함...
    const address = pubKey.getStarknetAddress(salt, classHash);

    return {
      name: this.keyRingService.getKeyRingName(vaultId),
      hexAddress: `0x${Buffer.from(address).toString("hex")}`,
      pubKey: pubKey.toBytes(),
      address,
    };
  }

  async getStarknetKeyParams(chainId: string): Promise<{
    pubKey: Uint8Array;
    address: Uint8Array;
    salt: Uint8Array;
    classHash: Uint8Array;
    xLow: Uint8Array;
    xHigh: Uint8Array;
    yLow: Uint8Array;
    yHigh: Uint8Array;
  }> {
    const chainInfo = this.chainsService.getModularChainInfoOrThrow(chainId);
    if (!("starknet" in chainInfo)) {
      throw new Error("Chain is not a starknet chain");
    }
    const vaultId = this.keyRingService.selectedVaultId;
    const pubKey = await this.keyRingService.getPubKey(chainId, vaultId);

    const salt = Buffer.from("11", "hex");
    const classHash = Buffer.from(
      "02203673e728fa07de1c2ea60405399ffefaf875f1b7ae54e747659e1e216d94",
      "hex"
    );
    // TODO: salt를 어떻게 할지 생각한다...
    //       class hash의 경우도 생각해야함...
    const address = pubKey.getStarknetAddress(salt, classHash);
    const addressParams = pubKey.getStarknetAddressParams();

    return {
      pubKey: pubKey.toBytes(),
      address,
      salt,
      classHash,
      xLow: addressParams.xLow,
      xHigh: addressParams.xHigh,
      yLow: addressParams.yLow,
      yHigh: addressParams.yHigh,
    };
  }

  async request<T = any>(
    env: Env,
    origin: string,
    type: string,
    params?: any,
    chainId?: string
  ): Promise<T> {
    if (env.isInternalMsg && chainId == null) {
      throw new Error(
        "The chain id must be provided for the internal message."
      );
    }

    const currentChainId =
      this.permissionService.getCurrentChainIdForStarknet(origin) ?? chainId;
    if (currentChainId == null) {
      if (type === "keplr_initStarknetProviderState") {
        return {
          currentChainId: null,
          selectedAddress: null,
          rpc: null,
        } as T;
      } else {
        throw new Error(
          `${origin} is not permitted. Please disconnect and reconnect to the website.`
        );
      }
    }
    const selectedAddress = (await this.getStarknetKeySelected(currentChainId))
      .hexAddress;

    const modularChainInfo =
      this.chainsService.getModularChainInfoOrThrow(currentChainId);
    if (!("starknet" in modularChainInfo)) {
      throw new Error("Chain is not a starknet chain");
    }

    const result = (await (async () => {
      switch (type) {
        case "keplr_initStarknetProviderState":
        case "keplr_enableStarknetProvider": {
          return {
            currentChainId,
            selectedAddress,
            rpc: modularChainInfo.starknet.rpc,
          };
        }
        case "wallet_watchAsset": {
          const param = params as WatchAssetParameters | undefined;
          if (param?.type !== "ERC20") {
            throw new Error("Not a supported asset type.");
          }

          const contractAddress = param.options.address;

          await this.tokenERC20Service.suggestERC20Token(
            env,
            currentChainId,
            contractAddress
          );

          return;
        }
        case "wallet_requestAccounts": {
          return [
            (await this.getStarknetKeySelected(currentChainId)).hexAddress,
          ];
        }
        case "wallet_getPermissions": {
          // TODO: 이거 반환값을 어떻게 줘야하는지 명확한게 아님
          //       다시 확인해봐야함.
          if (
            this.permissionService.hasPermission(
              currentChainId,
              getBasicAccessPermissionType(),
              origin
            )
          ) {
            return ["accounts"];
          }
          return [""];
        }
        case "wallet_switchStarknetChain": {
          const param =
            (Array.isArray(params) && (params?.[0] as { chainId: string })) ||
            undefined;
          if (!param?.chainId) {
            throw new Error("Invalid parameters: must provide a chain id.");
          }

          const newChainId = param.chainId;

          // TODO: 인터페이스 상 얘는 boolean을 반환한다.
          //       바꿀 체인을 찾을 수 없거나 바꿀 체인이 starknet이 아닌 경우
          //       false를 반환할지 오류를 던질지 정해야한다.
          const newCurrentChainInfo =
            this.chainsService.getModularChainInfoOrThrow(newChainId);
          if (!("starknet" in newCurrentChainInfo)) {
            throw new Error("Chain is not a starknet chain");
          }

          await this.permissionService.updateCurrentChainIdForStarknet(
            env,
            origin,
            newCurrentChainInfo.chainId
          );

          return true;
        }
        case "wallet_requestChainId": {
          return currentChainId;
        }
        case "wallet_deploymentData": {
          // TODO: 아직 먼 기능인지 이해 못함
          throw new Error("Not implemented");
        }
        case "wallet_addInvokeTransaction": {
          const account = this.generateAccountInterface(
            env,
            origin,
            selectedAddress
          );

          const calls: Call[] = [];
          if (!Array.isArray(params.calls)) {
            calls.push({
              contractAddress: params.calls.contract_address,
              entrypoint: params.calls.entry_point,
              calldata: params.calls.calldata,
            });
          } else {
            for (const call of params.calls) {
              calls.push({
                contractAddress: call.contract_address,
                entrypoint: call.entry_point,
                calldata: call.calldata,
              });
            }
          }
          return await account.executeWithSignUI(
            env,
            origin,
            currentChainId,
            this,
            calls
          );
        }
        case "wallet_addDeclareTransaction": {
          // TODO
          throw new Error("Not implemented");
        }
        case "wallet_signTypedData": {
          return await this.signStarknetMessageSelected(
            env,
            origin,
            currentChainId,
            (
              await this.getStarknetKeySelected(currentChainId)
            ).hexAddress,
            params as any
          );
        }
        case "wallet_supportedSpecs": {
          // TODO: 멀 반환해야하지...?
          return [];
        }
        case "starknet_addDeclareTransaction":
        case "starknet_addDeployAccountTransaction":
        case "starknet_addInvokeTransaction":
        case "starknet_blockHashAndNumber":
        case "starknet_blockNumber":
        case "starknet_call":
        case "starknet_chainId":
        case "starknet_estimateFee":
        case "starknet_getBlockTransactionCount":
        case "starknet_getBlockWithTxHashes":
        case "starknet_getBlockWithTxs":
        case "starknet_getClass":
        case "starknet_getClassAt":
        case "starknet_getClassHashAt":
        case "starknet_getEvents":
        case "starknet_getNonce":
        case "starknet_getStateUpdate":
        case "starknet_getStorageAt":
        case "starknet_getTransactionByBlockIdAndIndex":
        case "starknet_getTransactionByHash":
        case "starknet_getTransactionReceipt":
        case "starknet_pendingTransactions":
        case "starknet_simulateTransactions":
        case "starknet_specVersion":
        case "starknet_syncing": {
          return await simpleFetch(modularChainInfo.starknet.rpc, {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              id: 1,
              jsonrpc: "2.0",
              method: type,
              params,
            }),
          });
        }
        default: {
          throw new Error(`The type "${type}" is not supported.`);
        }
      }
    })()) as T;

    return result;
  }

  async signStarknetMessageSelected(
    env: Env,
    origin: string,
    chainId: string,
    signer: string,
    typedData: StarknetTypedData
  ): Promise<string[]> {
    return await this.signStarknetMessage(
      env,
      origin,
      this.keyRingService.selectedVaultId,
      chainId,
      signer,
      typedData
    );
  }

  async signStarknetMessage(
    _env: Env,
    _origin: string,
    vaultId: string,
    chainId: string,
    signer: string,
    typedData: StarknetTypedData
  ): Promise<string[]> {
    // TODO: tx에서 signer와 실제 계정 / chain id에 대해서 validation 넣기

    let msgHash = starknetTypedDataUtils.getMessageHash(typedData, signer);

    msgHash = msgHash.replace("0x", "");
    const padZero = 64 - msgHash.length;
    if (padZero > 0) {
      msgHash = "0".repeat(padZero) + msgHash;
    } else if (padZero < 0) {
      throw new Error("Invalid length of msg hash");
    }
    const sig = await this.keyRingService.sign(
      chainId,
      vaultId,
      Buffer.from(msgHash, "hex"),
      "noop"
    );
    return this.formatEthSignature(sig);
  }

  // TODO: noChangeTx 기능은 아직 작동하지 않음
  async signStarknetTransactionSelected(
    env: Env,
    origin: string,
    chainId: string,
    transactions: Call[],
    details: InvocationsSignerDetails,
    noChangeTx: boolean
  ): Promise<{
    transactions: Call[];
    details: InvocationsSignerDetails;
    signature: string[];
  }> {
    return await this.signStarknetTransaction(
      env,
      origin,
      this.keyRingService.selectedVaultId,
      chainId,
      transactions,
      details,
      noChangeTx
    );
  }

  async signStarknetTransaction(
    env: Env,
    origin: string,
    vaultId: string,
    chainId: string,
    transactions: Call[],
    details: InvocationsSignerDetails,
    noChangeTx: boolean
  ): Promise<{
    transactions: Call[];
    details: InvocationsSignerDetails;
    signature: string[];
  }> {
    // TODO: tx에서 signer와 실제 계정 / chain id에 대해서 validation 넣기

    const key = await this.getStarknetKeySelected(chainId);

    return await this.interactionService.waitApproveV2(
      env,
      "/sign-starknet-tx",
      "request-sign-starknet-tx",
      {
        origin,
        vaultId,
        chainId,
        signer: key.hexAddress,
        transactions,
        details,
        noChangeTx,
      },
      async (res: {
        transactions: Call[];
        details: InvocationsSignerDetails;
      }) => {
        const { transactions, details } = res;
        const compiledCalldata = starknetTransactionUtils.getExecuteCalldata(
          transactions,
          details.cairoVersion
        );
        let msgHash;

        if (
          Object.values(ETransactionVersion1).includes(details.version as any)
        ) {
          const det = details as V2InvocationsSignerDetails;
          msgHash = starknetHashUtils.calculateInvokeTransactionHash({
            ...det,
            senderAddress: det.walletAddress,
            compiledCalldata,
            version: det.version,
          });
        } else if (
          Object.values(ETransactionVersion3).includes(details.version as any)
        ) {
          const det = details as V3InvocationsSignerDetails;
          msgHash = starknetHashUtils.calculateInvokeTransactionHash({
            ...det,
            senderAddress: det.walletAddress,
            compiledCalldata,
            version: det.version,
            nonceDataAvailabilityMode: intDAM(det.nonceDataAvailabilityMode),
            feeDataAvailabilityMode: intDAM(det.feeDataAvailabilityMode),
          });
        } else {
          throw Error("unsupported signTransaction version");
        }

        msgHash = msgHash.replace("0x", "");
        const padZero = 64 - msgHash.length;
        if (padZero > 0) {
          msgHash = "0".repeat(padZero) + msgHash;
        } else if (padZero < 0) {
          throw new Error("Invalid length of msg hash");
        }
        const sig = await this.keyRingService.sign(
          chainId,
          vaultId,
          Buffer.from(msgHash, "hex"),
          "noop"
        );
        return {
          transactions,
          details,
          signature: this.formatEthSignature(sig),
        };
      }
    );
  }

  async signStarknetDeployAccountTransactionSelected(
    env: Env,
    origin: string,
    chainId: string,
    details: DeployAccountSignerDetails
  ): Promise<{
    transaction: DeployAccountSignerDetails;
    signature: string[];
  }> {
    return await this.signStarknetDeployAccountTransaction(
      env,
      origin,
      this.keyRingService.selectedVaultId,
      chainId,
      details
    );
  }

  async signStarknetDeployAccountTransaction(
    env: Env,
    _origin: string,
    vaultId: string,
    chainId: string,
    details: DeployAccountSignerDetails
  ): Promise<{
    transaction: DeployAccountSignerDetails;
    signature: string[];
  }> {
    if (!env.isInternalMsg) {
      throw new Error(
        "This function is not yet allowed for the external message"
      );
    }

    // TODO: tx에서 signer와 실제 계정 / chain id에 대해서 validation 넣기

    const compiledConstructorCalldata = CallData.compile(
      details.constructorCalldata
    );
    let msgHash;

    if (Object.values(ETransactionVersion1).includes(details.version as any)) {
      const det = details as V2DeployAccountSignerDetails;
      msgHash = starknetHashUtils.calculateDeployAccountTransactionHash({
        ...det,
        salt: det.addressSalt,
        constructorCalldata: compiledConstructorCalldata,
        version: det.version,
      });
    } else if (
      Object.values(ETransactionVersion3).includes(details.version as any)
    ) {
      const det = details as V3DeployAccountSignerDetails;
      msgHash = starknetHashUtils.calculateDeployAccountTransactionHash({
        ...det,
        salt: det.addressSalt,
        compiledConstructorCalldata,
        version: det.version,
        nonceDataAvailabilityMode: intDAM(det.nonceDataAvailabilityMode),
        feeDataAvailabilityMode: intDAM(det.feeDataAvailabilityMode),
      });
    } else {
      throw Error("unsupported signDeployAccountTransaction version");
    }

    msgHash = msgHash.replace("0x", "");
    const padZero = 64 - msgHash.length;
    if (padZero > 0) {
      msgHash = "0".repeat(padZero) + msgHash;
    } else if (padZero < 0) {
      throw new Error("Invalid length of msg hash");
    }
    const sig = await this.keyRingService.sign(
      chainId,
      vaultId,
      Buffer.from(msgHash, "hex"),
      "noop"
    );
    return {
      transaction: details,
      signature: this.formatEthSignature(sig),
    };
  }

  async signStarknetDeclareTransactionSelected(
    env: Env,
    origin: string,
    chainId: string,
    details: DeclareSignerDetails
  ): Promise<string[]> {
    return await this.signStarknetDeclareTransactionn(
      env,
      origin,
      this.keyRingService.selectedVaultId,
      chainId,
      details
    );
  }

  async signStarknetDeclareTransactionn(
    _env: Env,
    _origin: string,
    vaultId: string,
    chainId: string,
    details: DeclareSignerDetails
  ): Promise<string[]> {
    // TODO: tx에서 signer와 실제 계정 / chain id에 대해서 validation 넣기
    let msgHash;

    if (Object.values(ETransactionVersion1).includes(details.version as any)) {
      const det = details as V2DeclareSignerDetails;
      msgHash = starknetHashUtils.calculateDeclareTransactionHash({
        ...det,
        version: det.version,
      });
    } else if (
      Object.values(ETransactionVersion3).includes(details.version as any)
    ) {
      const det = details as V3DeclareSignerDetails;
      msgHash = starknetHashUtils.calculateDeclareTransactionHash({
        ...det,
        version: det.version,
        nonceDataAvailabilityMode: intDAM(det.nonceDataAvailabilityMode),
        feeDataAvailabilityMode: intDAM(det.feeDataAvailabilityMode),
      });
    } else {
      throw Error("unsupported signDeclareTransaction version");
    }

    msgHash = msgHash.replace("0x", "");
    const padZero = 64 - msgHash.length;
    if (padZero > 0) {
      msgHash = "0".repeat(padZero) + msgHash;
    } else if (padZero < 0) {
      throw new Error("Invalid length of msg hash");
    }
    const sig = await this.keyRingService.sign(
      chainId,
      vaultId,
      Buffer.from(msgHash, "hex"),
      "noop"
    );
    return this.formatEthSignature(sig);
  }

  protected formatEthSignature(sig: {
    readonly r: Uint8Array;
    readonly s: Uint8Array;
    readonly v: number | null;
  }): string[] {
    if (sig.v == null) {
      throw new Error("Invalid signature");
    }

    const r = new CairoUint256(
      "0x" + Buffer.from(sig.r).toString("hex")
    ).toUint256HexString();
    const s = new CairoUint256(
      "0x" + Buffer.from(sig.s).toString("hex")
    ).toUint256HexString();
    return [r.low, r.high, s.low, s.high, "0x" + sig.v.toString(16)];
  }
}

class SignerInterfaceImpl extends SignerInterface {
  constructor(
    protected readonly env: Env,
    protected readonly origin: string,
    protected readonly ProviderInterface: ProviderInterface,
    protected readonly keyRingService: KeyRingService,
    protected readonly permissionService: PermissionService,
    protected readonly service: KeyRingStarknetService
  ) {
    super();
  }

  getChainId(): string {
    const chainId = this.permissionService.getCurrentChainIdForStarknet(
      this.origin
    );
    if (!chainId) {
      throw new Error("Chain id is not set");
    }
    return chainId;
  }

  async getPubKey(): Promise<string> {
    return (
      "0x" +
      Buffer.from(
        (await this.service.getStarknetKeySelected(this.getChainId())).pubKey
      ).toString("hex")
    );
  }

  async signDeclareTransaction(
    transaction: DeclareSignerDetails
  ): Promise<Signature> {
    return await this.service.signStarknetDeclareTransactionSelected(
      this.env,
      this.origin,
      this.getChainId(),
      transaction
    );
  }

  async signDeployAccountTransaction(
    transaction: DeployAccountSignerDetails
  ): Promise<Signature> {
    return (
      await this.service.signStarknetDeployAccountTransactionSelected(
        this.env,
        this.origin,
        this.getChainId(),
        transaction
      )
    ).signature;
  }

  async signMessage(
    typedData: TypedData,
    accountAddress: string
  ): Promise<Signature> {
    return await this.service.signStarknetMessageSelected(
      this.env,
      this.origin,
      this.getChainId(),
      accountAddress,
      typedData
    );
  }

  async signTransaction(
    transactions: Call[],
    transactionsDetail: InvocationsSignerDetails
  ): Promise<Signature> {
    return (
      await this.service.signStarknetTransactionSelected(
        this.env,
        this.origin,
        this.getChainId(),
        transactions,
        transactionsDetail,
        true
      )
    ).signature;
  }
}

const ETransactionVersion1 = {
  V1: "0x1" as const,
  F1: "0x100000000000000000000000000000001" as const,
};

const ETransactionVersion3 = {
  V3: "0x3" as const,
  F3: "0x100000000000000000000000000000003" as const,
};

const EDataAvailabilityMode = {
  L1: "L1" as const,
  L2: "L2" as const,
};

const EDAMode = {
  L1: 0 as const,
  L2: 1 as const,
};

function intDAM(dam: "L1" | "L2"): 0 | 1 {
  if (dam === EDataAvailabilityMode.L1) return EDAMode.L1;
  if (dam === EDataAvailabilityMode.L2) return EDAMode.L2;
  throw Error("EDAM conversion");
}
