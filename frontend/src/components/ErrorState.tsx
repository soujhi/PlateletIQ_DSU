import React from "react";

interface Props {
  message?: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<Props> = ({ message = "Failed to load data from server.", onRetry }) => {
  return (
    <div className="p-6 bg-[#FDF2F2] border border-[#F8B4B4] rounded-[14px] text-center my-4">
      <p className="text-[14px] font-semibold text-[#9B1C1C] mb-1">Service Unavailable</p>
      <p className="text-[12px] text-[#C81E1E] mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-[#9B1C1C] text-white text-[12px] font-medium rounded-full hover:bg-[#7E1D1D] transition-colors"
        >
          Retry request
        </button>
      )}
    </div>
  );
};
