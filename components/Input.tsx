'use client';

import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: boolean;
}

export default function Input({
  label,
  helperText,
  error = false,
  className = '',
  type,
  ...props
}: InputProps) {
  const isPassword = type === 'password';
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-medium text-neutral-900">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          type={isPassword && showPassword ? 'text' : type}
          className={`w-full px-4 py-2 border-2 rounded-base text-base font-normal transition-colors focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 disabled:bg-neutral-50 disabled:text-neutral-300 ${
            error
              ? 'border-error text-error'
              : 'border-neutral-200 text-neutral-900 hover:border-neutral-300'
          } ${isPassword ? 'pr-11' : ''} ${className}`}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onMouseDown={(event) => {
              // Keep focus on the input while toggling, so typing can continue.
              event.preventDefault();
            }}
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            title={showPassword ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 z-10 grid w-11 place-items-center rounded-base text-neutral-400 transition hover:text-neutral-700 focus:outline-none focus-visible:text-neutral-900"
          >
            {showPassword ? (
              <EyeOff size={17} strokeWidth={1.9} />
            ) : (
              <Eye size={17} strokeWidth={1.9} />
            )}
          </button>
        )}
      </div>
      {helperText && (
        <span className={`text-xs ${error ? 'text-error' : 'text-neutral-500'}`}>
          {helperText}
        </span>
      )}
    </div>
  );
}
