import React, { useState } from "react";

interface CollapseProps {
  title: string;
  onClick?: () => void;
  open?: boolean;
  collapsible?: boolean;
  children: React.ReactNode;
}

const Collapse: React.FC<CollapseProps> = ({
  title,
  open = false,
  collapsible = true,
  onClick,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(open);

  const toggleCollapse = () => {
    if (collapsible) {
      setIsOpen((prev) => !prev);
    }
    if (onClick) {
      onClick();
    }
  };

  return (
    <div className="rounded-md shadow-md md:mb-10 mb-2 text-sm md:text-base">
      <button
        onClick={toggleCollapse}
        className="text-left px-4 py-2 green-card rounded-tl-md rounded-tr-md md:text-lg text-sm font-semibold flex justify-between items-center"
      >
        <span>{title}</span>
        <span
          className={`transform transition-transform duration-300 ${
            isOpen ? "rotate-180" : "rotate-0"
          }`}
        >
          {collapsible ? <span className="mr-2 ml-2">▼</span> : ""}
        </span>
      </button>
      <div className="w-full h-2 green-card" />
      <div
        className={`overflow-auto md:overflow-y-auto transition-all duration-300 ${
          isOpen ? "max-h-screen md:max-h-full" : "max-h-0"
        }`}
      >
        <div className="p-4 bg-brown-900">{children}</div>
      </div>
    </div>
  );
};

export default Collapse;
