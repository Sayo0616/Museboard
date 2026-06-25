import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonProps = PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>> & {
  variant?: "default" | "primary" | "ghost";
};

export function Button({ children, variant = "default", className = "", ...props }: ButtonProps) {
  return (
    <button className={`ui-button ui-button-${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
