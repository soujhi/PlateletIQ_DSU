import React from "react";

interface Props {
  className?: string;
  height?: string;
}

export const LoadingSkeleton: React.FC<Props> = ({ className = "w-full h-12", height }) => {
  return (
    <div
      className={`bg-[#E5E5E7] animate-pulse rounded-[10px] ${className}`}
      style={height ? { height } : undefined}
    />
  );
};
