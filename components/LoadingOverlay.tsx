import React from 'react';

interface LoadingOverlayProps {
  message: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ message }) => {
  return (
    <div className="fixed inset-0 bg-white/90 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-4">
      <div className="relative w-20 h-20 mb-6">
        <div className="absolute top-0 left-0 w-full h-full border-4 border-brand-100 rounded-full"></div>
        <div className="absolute top-0 left-0 w-full h-full border-4 border-brand-600 rounded-full border-t-transparent animate-spin"></div>
        {/* Simple Chef Icon centered */}
        <div className="absolute inset-0 flex items-center justify-center text-2xl">
          👨‍🍳
        </div>
      </div>
      <h3 className="text-xl font-bold text-gray-800 text-center animate-pulse">{message}</h3>
      <p className="text-gray-500 mt-2 text-sm text-center max-w-xs">
        Estamos usando IA para analizar y cocinar virtualmente...
      </p>
    </div>
  );
};