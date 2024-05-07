import React, {FunctionComponent} from 'react';
import {IconProps} from './types';
import {Path, Svg} from 'react-native-svg';

export const BrowserIcon: FunctionComponent<IconProps> = ({size, color}) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <Path
        d="M13.9999 2.33337C10.1978 2.33337 6.82339 4.17366 4.69165 7.00004H4.66659V7.03194C3.2082 8.97952 2.33325 11.3872 2.33325 14C2.33325 20.4295 7.57042 25.6667 13.9999 25.6667C20.4294 25.6667 25.6666 20.4295 25.6666 14C25.6666 7.57054 20.4294 2.33337 13.9999 2.33337ZM17.4999 5.34802C20.9242 6.72863 23.3333 10.0715 23.3333 14C23.3333 16.4358 22.4006 18.6414 20.8814 20.3005C20.5829 19.3558 19.7102 18.6667 18.6666 18.6667C18.0226 18.6667 17.4999 18.144 17.4999 17.5V15.1667C17.4999 14.5227 16.9773 14 16.3333 14H11.6666C11.0226 14 10.4999 13.4774 10.4999 12.8334C10.4999 12.1894 11.0226 11.6667 11.6666 11.6667C12.3106 11.6667 12.8333 11.144 12.8333 10.5V9.33337C12.8333 8.68937 13.3559 8.16671 13.9999 8.16671H15.1666C16.4558 8.16671 17.4999 7.12254 17.4999 5.83337V5.34802ZM4.90812 11.9082L10.4999 17.5V18.6667C10.4999 19.9559 11.5441 21 12.8333 21V23.2536C8.21999 22.6814 4.66659 18.7725 4.66659 14C4.66659 13.2793 4.7547 12.5814 4.90812 11.9082Z"
        fill={color || 'currentColor'}
      />
    </Svg>
  );
};
