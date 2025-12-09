import React, { useState } from 'react';

interface EmojiPickerProps {
  onSelectEmoji: (emoji: string) => void;
  onSelectSticker: (url: string) => void;
}

const EMOJIS = [
  "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "🥲", "🥹",
  "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗",
  "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓",
  "😎", "🥸", "🤩", "🥳", "😏", "😒", "😞", "😔", "😟", "😕",
  "👍", "👎", "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏",
  "🔥", "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎",
  "💯", "💢", "💥", "💫", "💦", "💨", "🕳️", "💣", "💬", "👁️‍🗨️",
];

const STICKERS = [
  "https://cdn-icons-png.flaticon.com/512/9308/9308673.png", // Cat
  "https://cdn-icons-png.flaticon.com/512/9308/9308682.png", // Dog
  "https://cdn-icons-png.flaticon.com/512/9308/9308696.png", // Rabbit
  "https://cdn-icons-png.flaticon.com/512/9308/9308587.png", // Bear
  "https://cdn-icons-png.flaticon.com/512/4193/4193246.png", // Ghost
  "https://cdn-icons-png.flaticon.com/512/4193/4193297.png", // Alien
  "https://cdn-icons-png.flaticon.com/512/4193/4193356.png", // Robot
  "https://cdn-icons-png.flaticon.com/512/4193/4193409.png", // Poop
];

const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelectEmoji, onSelectSticker }) => {
  const [tab, setTab] = useState<'emoji' | 'sticker'>('emoji');

  return (
    <div className="absolute bottom-full left-0 mb-2 w-72 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden flex flex-col z-20 animate-in zoom-in-95 duration-200">
      <div className="flex border-b border-gray-100">
        <button
          onClick={() => setTab('emoji')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${tab === 'emoji' ? 'text-blue-600 bg-blue-50/50' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          Смайлики
        </button>
        <button
          onClick={() => setTab('sticker')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${tab === 'sticker' ? 'text-blue-600 bg-blue-50/50' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          Стикеры
        </button>
      </div>

      <div className="h-64 overflow-y-auto p-2 scrollbar-thin">
        {tab === 'emoji' ? (
          <div className="grid grid-cols-6 gap-1">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => onSelectEmoji(emoji)}
                className="p-1.5 hover:bg-gray-100 rounded text-xl transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 p-1">
            {STICKERS.map((sticker) => (
              <button
                key={sticker}
                onClick={() => onSelectSticker(sticker)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors group"
              >
                <img src={sticker} alt="Sticker" className="w-full h-auto group-hover:scale-110 transition-transform" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default EmojiPicker;
