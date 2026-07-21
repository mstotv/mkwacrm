'use client';

import React, { useEffect, useRef } from 'react';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

interface TelegramLoginWidgetProps {
  botUsername: string;
  onAuth: (user: TelegramUser) => void;
  size?: 'small' | 'medium' | 'large';
  cornerRadius?: number;
  requestAccess?: 'write' | 'read';
  usePic?: boolean;
}

export function TelegramLoginWidget({
  botUsername,
  onAuth,
  size = 'large',
  cornerRadius = 8,
  requestAccess = 'write',
  usePic = true,
}: TelegramLoginWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onAuthRef = useRef(onAuth);

  useEffect(() => {
    onAuthRef.current = onAuth;
  }, [onAuth]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Remove any previous widget instances
    containerRef.current.innerHTML = '';

    // Standardize bot username by trimming spaces, removing quotes, and the leading @ if present
    const cleanBotUsername = botUsername
      .trim()
      .replace(/^['"]|['"]$/g, '')
      .replace(/^@/, '')
      .trim();

    // Set callback in global scope
    const callbackName = `onTelegramAuth_${Math.random().toString(36).substring(2, 9)}`;
    (window as any)[callbackName] = (user: TelegramUser) => {
      onAuthRef.current(user);
    };

    // Create the script tag
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', cleanBotUsername);
    script.setAttribute('data-size', size);
    script.setAttribute('data-radius', cornerRadius.toString());
    script.setAttribute('data-onauth', `${callbackName}(user)`);
    script.setAttribute('data-request-access', requestAccess);
    if (!usePic) {
      script.setAttribute('data-userpic', 'false');
    }

    // Append script to container
    containerRef.current.appendChild(script);

    // Cleanup
    return () => {
      delete (window as any)[callbackName];
    };
  }, [botUsername, size, cornerRadius, requestAccess, usePic]);

  return (
    <div className="flex flex-col items-center justify-center py-2">
      <div ref={containerRef} className="telegram-widget-container" />
    </div>
  );
}
