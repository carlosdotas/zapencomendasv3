import React, { useEffect, useState } from 'react';
import { formatPhotoUrl } from '../../services/apiAdapters';

interface UserAvatarProps {
  src?: string | null;
  name?: string | null;
  className: string;
  imageClassName?: string;
  fallbackClassName?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  src,
  name,
  className,
  imageClassName = 'h-full w-full object-cover',
  fallbackClassName = 'flex h-full w-full items-center justify-center bg-[#0B5187]/15 font-black text-[#0B5187]'
}) => {
  const rawSource = typeof src === 'string' ? src.trim() : '';
  const imageSource = rawSource ? (formatPhotoUrl(rawSource, 'thumb') || rawSource) : '';
  const [failedSource, setFailedSource] = useState('');

  useEffect(() => {
    setFailedSource('');
  }, [imageSource]);

  const initials = name?.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'EZ';

  return (
    <div className={`relative shrink-0 ${className}`}>
      {imageSource && failedSource !== imageSource ? (
        <img
          key={imageSource}
          src={imageSource}
          alt={name || 'Usuário'}
          onError={() => setFailedSource(imageSource)}
          className={imageClassName}
        />
      ) : (
        <div className={fallbackClassName} aria-label={name || 'Usuário'}>
          {initials}
        </div>
      )}
    </div>
  );
};