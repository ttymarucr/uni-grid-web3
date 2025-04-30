import React from "react";


export const GridType = ({
  symbol,
  ...props
}) => {
  return (
    <div>
      <div className="flex gap-2 text-sm">
        <label className="flex-1">
          <input
            {...props}
            type="radio"
            value="1"
            className="hidden peer"
          />
          <div className="peer-checked:bg-teal-500 peer-checked:text-white border border-gray-300 rounded-md text-center py-2 cursor-pointer hover:bg-gray-100 hover:text-black">
            Buy {symbol}
          </div>
        </label>
        <label className="flex-1">
          <input
            {...props}
            type="radio"
            value="0"
            className="hidden peer"
          />
          <div className="peer-checked:bg-gray-500 peer-checked:text-white border border-gray-300 rounded-md text-center py-2 cursor-pointer hover:bg-gray-100 hover:text-black">
            Neutral
          </div>
        </label>
        <label className="flex-1">
          <input
            {...props}
            type="radio"
            value="2"
            className="hidden peer"
          />
          <div className="peer-checked:bg-red-500 peer-checked:text-white border border-gray-300 rounded-md text-center py-2 cursor-pointer hover:bg-gray-100 hover:text-black">
            Sell {symbol}
          </div>
        </label>
      </div>
    </div>
  );
};
