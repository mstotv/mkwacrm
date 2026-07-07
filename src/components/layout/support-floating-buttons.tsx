'use client';

import React from 'react';
import { useSiteSettings } from '@/hooks/use-site-settings';
import { MessageCircle } from 'lucide-react';
// Assuming lucide-react doesn't have an official telegram icon, we can use an SVG or a generic message icon.
// I'll use Send for telegram, or raw SVG.
import { Send } from 'lucide-react';

export function SupportFloatingButtons() {
  const { settings } = useSiteSettings();

  const {
    support_whatsapp_enabled,
    support_whatsapp_number,
    support_telegram_enabled,
    support_telegram_username,
  } = settings;

  // Render nothing if both are disabled or missing info
  if (!support_whatsapp_enabled && !support_telegram_enabled) return null;

  const handleWhatsappClick = () => {
    if (support_whatsapp_number) {
      window.open(`https://wa.me/${support_whatsapp_number}`, '_blank');
    }
  };

  const handleTelegramClick = () => {
    if (support_telegram_username) {
      window.open(`https://t.me/${support_telegram_username}`, '_blank');
    }
  };

  return (
    <>
      {/* WhatsApp Button - Bottom Right */}
      {support_whatsapp_enabled && support_whatsapp_number && (
        <button
          onClick={handleWhatsappClick}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-[#25D366]/30 transition-transform hover:scale-110 active:scale-95"
          aria-label="Contact us on WhatsApp"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-7 w-7"
          >
            <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86s.274.072.376-.043c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.099.824zm-3.423-14.416c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm.082 19.165c-1.353 0-2.678-.344-3.843-.997l-4.249 1.115 1.135-4.143c-.717-1.218-1.095-2.604-1.095-4.04 0-4.407 3.585-7.994 7.992-7.994 4.409 0 8.001 3.589 8.001 7.996 0 4.407-3.593 7.993-8.001 7.993z" />
          </svg>
        </button>
      )}

      {/* Telegram Button - Bottom Left */}
      {support_telegram_enabled && support_telegram_username && (
        <button
          onClick={handleTelegramClick}
          className="fixed bottom-6 left-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#0088cc] text-white shadow-lg shadow-[#0088cc]/30 transition-transform hover:scale-110 active:scale-95"
          aria-label="Contact us on Telegram"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-7 w-7 pr-1"
          >
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.223-.548.223l.188-2.85 5.18-4.676c.223-.198-.054-.309-.346-.116l-6.405 4.027-2.766-.86c-.602-.188-.616-.602.126-.893l10.812-4.168c.5-.188.95.108.824.906z" />
          </svg>
        </button>
      )}
    </>
  );
}
