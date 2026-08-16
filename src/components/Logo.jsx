import React from 'react';

export default function Logo({ className = "w-8 h-8" }) {
  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <img src="/logo.svg" alt="Water Monkey cloud cost shield" className="w-full h-full drop-shadow-[0_6px_12px_rgba(79,70,229,0.22)]" />
    </div>
  );
}
