import React, { useState } from "react";

interface CollapseProps {
  title: string;
  open?: boolean;
  children: React.ReactNode;
}

const Collapse: React.FC<CollapseProps> = ({ title, open=false, children }) => {
  const [isOpen, setIsOpen] = useState(open);

  const toggleCollapse = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div className="rounded-md shadow-md md:mb-10 mb-2">
      <button
        onClick={toggleCollapse}
        className="text-left px-4 py-2 green-card rounded-tl-md rounded-tr-md text-lg font-semibold flex justify-between items-center"
      >
        <span>{title}</span>
        <span
          className={`transform transition-transform duration-300 ${
            isOpen ? "rotate-180" : "rotate-0"
          }`}
        >
          ▼
        </span>
      </button>
      <div className="w-full h-2 green-card"></div>
      <div
        className={`md:overflow-hidden overflow-auto transition-all duration-300 ${
          isOpen ? "max-h-screen" : "max-h-0"
        }`}
      >
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
};

export default Collapse;
