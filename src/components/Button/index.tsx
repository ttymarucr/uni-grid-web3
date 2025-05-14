import React from "react";

interface ButtonProps {
  buttonStyle?: "base" | "primary" | "secondary";
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  [key: string]: unknown; // Allow any other props
}

const Button: React.FC<ButtonProps> = ({
  buttonStyle = "base",
  onClick,
  children,
  className = "",
  ...props
}) => {
  const commonStyles =
    "px-4 py-2 rounded font-normal transition-all hover:cursor-pointer active:scale-95 disabled:opacity-50";
  const baseStyles = "green-card text-white hover:green-card";
  const primaryStyles = "bg-gray-900 text-white hover:bg-gray-800";
  const secondaryStyles = "bg-blue-500 text-white hover:bg-blue-600";

  const buttonStyles =
    buttonStyle === "base"
      ? baseStyles
      : buttonStyle === "secondary"
      ? secondaryStyles
      : primaryStyles;

  return (
    <button
      className={`${className} ${commonStyles} ${buttonStyles} `}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
