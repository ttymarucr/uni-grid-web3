import React, { useState, useRef, use, useEffect, useCallback } from "react";
import { useQuery } from "urql";

const QUERY = `query Tokens($symbol:String) {
    tokens(orderBy:totalValueLockedUSD, orderDirection: desc, where:{
        symbol_contains_nocase: $symbol,
        totalValueLockedUSD_gt: 0
    }){
      id
      symbol
      name
      decimals
      totalValueLockedUSD
    }
  }`;

const TokenSearchDropdown = ({ value, onChange }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [queryResult] = useQuery({
    query: QUERY,
    pause: !searchTerm, // Only execute query when searchTerm is not empty
    variables: { symbol: searchTerm },
  });

  const { data, fetching, error } = queryResult;
  const tokens = React.useMemo(() => data?.tokens || [], [data]);

  const valueToDisplay = useCallback(() => {
    if (value) {
      const token = tokens.find((token) => token.id === value);
      return token ? `${token.symbol} - ${token.id}` : "Select a token";
    }
    return "Select a token";
  }
  , [value, tokens]);

  useEffect(() => {
    if(fetching) {
        onChange(undefined);
    }
  }, [fetching, onChange]);

  const handleBlur = (e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDropdownVisible(false);
    }
  };

  return (
    <div onBlur={handleBlur} className="relative">

      {!isDropdownVisible ? (
        <div
          onClick={() => setIsDropdownVisible(true)}
          className="flex items-center justify-between p-2 border border-gray-300 rounded cursor-pointer"
        >
          <span className="text-gray-300 overflow-hidden whitespace-nowrap text-ellipsis">
            {valueToDisplay()}
          </span>
          <span className="text-gray-500">▼</span>
        </div>
      ):(
        <input
        ref={inputRef}
        type="text"
        placeholder="Search for a token..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      )}
      {isDropdownVisible && (
        <select
          size={5}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute bg-white top-full left-0 right-0 border border-gray-300 rounded shadow-lg max-h-52 overflow-y-auto z-50 w-full"
        >
          {fetching && <option disabled>Loading...</option>}
          {error && <option disabled>Error: {error.message}</option>}
          {!fetching && !error && tokens.map((token: { id: string; symbol: string }) => (
            <option
              key={token.id}
              value={token.id}
              className="p-2 text-gray-800"
            >
              {token.symbol} - {token.id}
            </option>
          ))}
        </select>
      )}
    </div>
  );
};

export default TokenSearchDropdown;
