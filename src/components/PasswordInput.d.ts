import * as React from "react";

declare const PasswordInput: React.ForwardRefExoticComponent<
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & React.RefAttributes<HTMLInputElement>
>;
export default PasswordInput;
