import React from "react";

const About = () => {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-4">Welcome to UniGrid</h1>
      <p className="mb-4">
        UniGrid is a decentralized grid trading tool built on top of Uniswap. It
        empowers users to automate their trading strategies by creating
        grid-based trading patterns directly on the Uniswap protocol.
      </p>
      <h2 className="text-2xl font-semibold mb-2">What is Grid Trading?</h2>
      <p className="mb-4">
        Grid trading is a popular strategy that involves placing buy and sell
        orders at predefined intervals above and below a set price. This
        strategy allows traders to profit from market volatility by buying low
        and selling high within the grid.
      </p>
      <h2 className="text-2xl font-semibold mb-2">Why Use UniGrid?</h2>
      <ul className="list-disc list-inside mb-4">
        <li>Automate your trading strategies with ease.</li>
        <li>Leverage Uniswap's decentralized liquidity pools.</li>
        <li>Maximize profits in volatile markets.</li>
        <li>Minimize manual intervention in trading.</li>
        <li>
          The tool is free of charge, no hidden fees except for regular
          blokchain transaction fees
        </li>
      </ul>
      <h2 className="text-2xl font-semibold mb-2">Key Features</h2>
      <ul className="list-disc list-inside mb-4">
        <li>Decentralized trading fully integrated with Uniswap.</li>
        <li>Customizable grid parameters like intervals and price ranges.</li>
        <li>Transparent, on-chain transactions for trust and security.</li>
        <li>Compounding feature to reinvest profits automatically.</li>
      </ul>
      <h2 className="text-2xl font-semibold mb-2">Get Started</h2>
      <p className="mb-4">
        To start using UniGrid, connect your wallet and explore the available
        tools to create and manage your grid trading strategies.
      </p>
      <h2 className="text-2xl font-semibold mb-2">Learn More</h2>
      <p>
        For more details, check out our{" "}
        <a href="/README.md" className="text-blue-500 underline">
          README
        </a>{" "}
        or visit the{" "}
        <a href="/CONTRIBUTING.md" className="text-blue-500 underline">
          Contributing Guide
        </a>{" "}
        to learn how you can help improve UniGrid.
      </p>
      <p>
        Donations to{" "}
        <a
          href="https://app.ens.domains/tty0.eth"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          tty0.eth
        </a>
      </p>
    </div>
  );
};

export default About;
