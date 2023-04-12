import React, { CSSProperties } from "react";

export interface TextInputProps {
  label?: string;
  rightLabel?: React.ReactNode;

  paragraph?: string;
  error?: string;
  errorBorder?: boolean;

  className?: string;

  disabled?: boolean;
  style?: CSSProperties;
  left?: React.ReactNode;
  right?: React.ReactNode;
  rightClick?: () => void;
}
