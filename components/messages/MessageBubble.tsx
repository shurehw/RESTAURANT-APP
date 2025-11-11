'use client';

interface Message {
  id: string;
  message_text: string;
  sender: {
    id: string;
    first_name: string;
    last_name: string;
  };
  created_at: string;
  mentioned_employee_ids?: string[];
  reply_to?: any;
  reactions?: any;
  is_edited?: boolean;
}

export function MessageBubble({
  message,
  isOwnMessage,
}: {
  message: Message;
  isOwnMessage: boolean;
}) {
  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[70%] ${isOwnMessage ? 'items-end' : 'items-start'}`}>
        {/* Sender name (only for others' messages) */}
        {!isOwnMessage && (
          <div className="text-sm font-semibold text-gray-700 mb-1 px-1">
            {message.sender.first_name} {message.sender.last_name}
          </div>
        )}

        {/* Message bubble */}
        <div
          className={`rounded-lg px-4 py-2 ${
            isOwnMessage
              ? 'bg-opsos-sage-600 text-white'
              : 'bg-white text-gray-900 border border-gray-200'
          }`}
        >
          {/* Reply-to indicator */}
          {message.reply_to && (
            <div
              className={`text-xs mb-2 pb-2 border-l-2 pl-2 ${
                isOwnMessage
                  ? 'border-white/30 text-white/70'
                  : 'border-gray-300 text-gray-500'
              }`}
            >
              <div className="font-semibold">
                Replying to {message.reply_to.sender?.first_name}
              </div>
              <div className="truncate">{message.reply_to.message_text}</div>
            </div>
          )}

          {/* Message text with @mention highlighting */}
          <p className="whitespace-pre-wrap break-words">
            {message.message_text.split(/(@\w+)/).map((part, i) =>
              part.startsWith('@') ? (
                <span
                  key={i}
                  className={`font-semibold ${
                    isOwnMessage
                      ? 'text-white underline'
                      : 'text-opsos-sage-600 underline'
                  }`}
                >
                  {part}
                </span>
              ) : (
                <span key={i}>{part}</span>
              )
            )}
          </p>

          {/* Edited indicator */}
          {message.is_edited && (
            <span
              className={`text-xs ml-2 ${
                isOwnMessage ? 'text-white/70' : 'text-gray-500'
              }`}
            >
              (edited)
            </span>
          )}
        </div>

        {/* Reactions */}
        {message.reactions && Object.keys(message.reactions).length > 0 && (
          <div className="flex gap-1 mt-1 px-1">
            {Object.entries(message.reactions).map(([emoji, users]: any) => (
              <button
                key={emoji}
                className="bg-gray-100 hover:bg-gray-200 rounded-full px-2 py-0.5 text-xs flex items-center gap-1"
              >
                <span>{emoji}</span>
                <span className="text-gray-600">{users.length}</span>
              </button>
            ))}
          </div>
        )}

        {/* Timestamp */}
        <div
          className={`text-xs text-gray-500 mt-1 px-1 ${
            isOwnMessage ? 'text-right' : ''
          }`}
        >
          {formatTime(message.created_at)}
        </div>
      </div>
    </div>
  );
}
