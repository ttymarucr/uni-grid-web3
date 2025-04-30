import React, { InputHTMLAttributes } from "react";

interface GridTypeProps extends InputHTMLAttributes<HTMLInputElement> {
  token0Symbol: string;
  token1Symbol: string;
}

export const GridType: React.FC<GridTypeProps> = ({
  token0Symbol,
  token1Symbol,
  ...props
}) => {
  return (
    <div>
      <div className="flex gap-2 text-sm">
        <label className="flex-1">
          <input {...props} type="radio" value="1" className="hidden peer" />
          <div
            title={`Buy ${token0Symbol} by Selling ${token1Symbol}`}
            className="peer-checked:bg-teal-500 peer-checked:text-white border border-gray-300 rounded-md text-center py-2 cursor-pointer hover:bg-gray-100 hover:text-black"
          >
            Buy {token0Symbol}
          </div>
        </label>
        <label className="flex-1">
          <input {...props} type="radio" value="0" className="hidden peer" />
          <div
            title="Buy and Sell Equally"
            className="peer-checked:bg-gray-500 peer-checked:text-white border border-gray-300 rounded-md text-center py-2 cursor-pointer hover:bg-gray-100 hover:text-black"
          >
            Neutral
          </div>
        </label>
        <label className="flex-1">
          <input {...props} type="radio" value="2" className="hidden peer" />
          <div
            title={`Sell ${token0Symbol} by Buying ${token1Symbol}`}
            className="peer-checked:bg-red-500 peer-checked:text-white border border-gray-300 rounded-md text-center py-2 cursor-pointer hover:bg-gray-100 hover:text-black"
          >
            Sell {token0Symbol}
          </div>
        </label>
      </div>
    </div>
  );
};
