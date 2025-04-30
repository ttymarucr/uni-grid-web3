import React, { useState } from "react";

const options = [
    {
      label: "Flat",
      value: 0,
      svg: <rect x="10" y="40" width="80" height="2" fill="white" />,
    },
    {
      label: "Linear",
      value: 1,
      svg: (
        <line x1="10" y1="50" x2="90" y2="10" stroke="white" strokeWidth="2" />
      ),
    },
    {
      label: "Reverse Linear",
      value: 2,
      svg: (
        <line x1="10" y1="10" x2="90" y2="50" stroke="white" strokeWidth="2" />
      ),
    },
    // not implemented yet
    // {
    //   label: "Sigmoid",
    //   value: 3,
    //   svg: (
    //     <path
    //       d="M10 50 C30 50 70 10 90 10"
    //       stroke="white"
    //       fill="none"
    //       strokeWidth="2"
    //     />
    //   ),
    // },
    {
      label: "Fibonacci",
      value: 4,
      svg: (
        <path
          d="M10 50 Q30 30 50 20 T90 10"
          stroke="white"
          fill="none"
          strokeWidth="2"
        />
      ),
    },
    // not implemented yet
    // {
    //   label: "Logarithmic",
    //   value: 5,
    //   svg: (
    //     <path
    //       d="M10 50 C30 10 70 10 90 50"
    //       stroke="white"
    //       fill="none"
    //       strokeWidth="2"
    //     />
    //   ),
    // },
  ];

export const DistributionType = ({...props}) => {
  const [selectedOption, setSelectedOption] = useState<number>();

  return (
    <div className="w-full inline-flex flex-wrap justify-center items-center">
      {options.map((option) => (
        <label key={option.value} className="cursor-pointer flex flex-col items-center">
          <input
            type="radio"
            {...props}
            className="hidden"
            value={option.value}
            checked={selectedOption === option.value}
            onChange={(e) => {
                setSelectedOption(option.value);
                props.onChange(e);
            }}
          />
          <div
            className={`m-2 w-20 max-w-20 h-15 max-h-20 rounded-lg bg-gray-800 p-2 hover:bg-gray-700 ${
              selectedOption === option.value ? "border-2 border-white" : "opacity-60"
            }`}
          >
            <svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg">
              {option.svg}
            </svg>
          </div>
          <span className="text-xs">{option.label}</span>
        </label>
      ))}
    </div>
  );
};
