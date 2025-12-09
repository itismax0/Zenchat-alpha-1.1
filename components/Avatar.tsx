
import React, { useState, useEffect } from 'react';
import { Bookmark } from 'lucide-react';
import { SAVED_MESSAGES_ID } from '../constants';

interface AvatarProps {
  src?: string;
  alt: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'custom';
  status?: boolean; // isOnline
  id?: string; // Added to identify Saved Messages
  className?: string;
}

const Avatar: React.FC<AvatarProps> = ({ src, alt, size = 'md', status, id, className = '' }) => {
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [src]);

  const sizeClasses: Record<string, string> = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-12 h-12 text-lg',
    lg: 'w-16 h-16 text-xl',
    xl: 'w-24 h-24 text-3xl',
    custom: 'w-full h-full text-4xl',
  };

  const currentSizeClass = sizeClasses[size] || sizeClasses.md;

  // Special handling for Saved Messages
  if (id === SAVED_MESSAGES_ID) {
      return (
          <div className={`${currentSizeClass} rounded-full bg-blue-500 flex items-center justify-center text-white shadow-sm ${className}`}>
              <Bookmark size={size === 'sm' ? 14 : size === 'md' ? 22 : size === 'lg' ? 28 : size === 'xl' ? 36 : 40} fill="currentColor" />
          </div>
      );
  }

  const safeAlt = alt || '?';

  const getInitials = (name: string) => {
    if (!name) return '?';
    return name.charAt(0).toUpperCase();
  };

  // Generate a consistent pastel color from the name string
  const getBackgroundColor = (name: string) => {
    if (!name) return '#94a3b8'; // default gray
    const colors = [
      '#ef4444', // red-500
      '#f97316', // orange-500
      '#f59e0b', // amber-500
      '#84cc16', // lime-500
      '#10b981', // emerald-500
      '#06b6d4', // cyan-500
      '#3b82f6', // blue-500
      '#6366f1', // indigo-500
      '#8b5cf6', // violet-500
      '#d946ef', // fuchsia-500
      '#f43f5e', // rose-500
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash % colors.length)];
  };

  const hasValidImage = src && !imageError;

  return (
    <div className={`relative inline-block ${size === 'custom' ? 'w-full h-full' : ''} ${className}`}>
      {hasValidImage ? (
        <img
          src={src}
          alt={safeAlt}
          onError={() => setImageError(true)}
          className={`${currentSizeClass} rounded-full object-cover border border-gray-100 bg-gray-200`}
        />
      ) : (
        <div 
            className={`${currentSizeClass} rounded-full flex items-center justify-center font-bold text-white shadow-inner border border-white/20`}
            style={{ backgroundColor: getBackgroundColor(safeAlt) }}
        >
            {getInitials(safeAlt)}
        </div>
      )}
      
      {status !== undefined && (
        <span
          className={`absolute bottom-0 right-0 block h-3 w-3 rounded-full ring-2 ring-white ${
            status ? 'bg-green-400' : 'bg-gray-400'
          }`}
        />
      )}
    </div>
  );
};

export default Avatar;
