import { useState } from "react";
import { TetherLike, TetherComment } from "@/lib/supabaseClient";
import { haptic } from "@/lib/haptics";

const QS = { fontFamily: "'Quicksand', sans-serif" };

export interface CardReactionProps {
  likes: TetherLike[];
  comments: TetherComment[];
  currentUserId: string;
  isAuthor: boolean;
  myName: string;
  partnerName: string;
  onLike: () => void;
  onComment: (text: string) => void;
  onDeleteComment: (id: string) => void;
  onDelete: () => void;
}

interface ReactionBarProps extends CardReactionProps {
  variant?: "light" | "dark";
}

export function ReactionBar({
  likes, comments, currentUserId, isAuthor,
  myName, partnerName,
  onLike, onComment, onDeleteComment, onDelete,
  variant = "light",
}: ReactionBarProps) {
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText]   = useState("");

  const L = variant === "light";
  const isLiked = likes.some(l => l.user_id === currentUserId);

  function name(authorId: string) {
    return authorId === currentUserId ? myName : partnerName;
  }

  function handleLike() {
    haptic("light");
    onLike();
  }

  function handleComment() {
    if (!commentText.trim()) return;
    haptic("light");
    onComment(commentText.trim());
    setCommentText("");
  }

  function handleDelete() {
    haptic("medium");
    onDelete();
  }

  function handleDeleteComment(id: string) {
    haptic("light");
    onDeleteComment(id);
  }

  return (
    <div onClick={e => e.stopPropagation()}>

      {/* ── Bar row ─────────────────────────────────────────────── */}
      <div className={`px-3 pt-2 pb-2 flex items-center gap-3 ${L ? "border-t border-gray-200/80" : "border-t border-white/12"}`}>

        {/* Like */}
        <button
          onClick={handleLike}
          className="flex items-center gap-1 active:scale-90 transition-transform"
        >
          <span className="text-sm leading-none">{isLiked ? "❤️" : "🤍"}</span>
          {likes.length > 0 && (
            <span className={`text-[11px] font-semibold ${L ? "text-gray-500" : "text-white/60"}`} style={QS}>
              {likes.length}
            </span>
          )}
        </button>

        {/* Comments toggle */}
        <button
          onClick={() => { setShowComments(v => !v); haptic("light"); }}
          className="flex items-center gap-1 active:scale-90 transition-transform"
        >
          <span className="text-sm leading-none">💬</span>
          {comments.length > 0 && (
            <span className={`text-[11px] font-semibold ${L ? "text-gray-500" : "text-white/60"}`} style={QS}>
              {comments.length}
            </span>
          )}
        </button>

        {/* Delete — author only */}
        {isAuthor && (
          <button
            onClick={handleDelete}
            className={`ml-auto text-base leading-none active:scale-90 transition-all ${L ? "opacity-25 active:opacity-60" : "opacity-20 active:opacity-50"}`}
          >
            🗑️
          </button>
        )}
      </div>

      {/* ── Comments panel ──────────────────────────────────────── */}
      {showComments && (
        <div className={`px-3 pb-3 space-y-1.5 ${L ? "" : ""}`}>
          {comments.length === 0 && (
            <p className={`text-[11px] pb-1 ${L ? "text-gray-400" : "text-white/35"}`} style={QS}>
              No comments yet.
            </p>
          )}

          {comments.map(c => (
            <div key={c.id} className="flex items-start gap-1.5">
              <div className="flex-1 min-w-0">
                <span className={`text-[11px] font-bold ${L ? "text-gray-700" : "text-white/80"}`} style={QS}>
                  {name(c.author_id)}:{" "}
                </span>
                <span className={`text-[11px] ${L ? "text-gray-600" : "text-white/60"}`} style={QS}>
                  {c.content}
                </span>
              </div>
              {c.author_id === currentUserId && (
                <button
                  onClick={() => handleDeleteComment(c.id)}
                  className={`flex-shrink-0 text-[11px] leading-none mt-0.5 transition-opacity active:opacity-50 ${L ? "text-gray-300" : "text-white/25"}`}
                >
                  ✕
                </button>
              )}
            </div>
          ))}

          {/* Input */}
          <div className="flex items-center gap-1.5 pt-1">
            <input
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleComment(); }}
              placeholder="Add a comment..."
              className={`flex-1 text-xs rounded-full px-3 py-1.5 focus:outline-none ${
                L
                  ? "bg-gray-100 text-gray-800 placeholder-gray-400 focus:ring-1 focus:ring-[#C53030]/40"
                  : "bg-white/10 text-white placeholder-white/35 border border-white/12 focus:ring-1 focus:ring-white/25"
              }`}
              style={QS}
            />
            <button
              onClick={handleComment}
              disabled={!commentText.trim()}
              className={`text-sm font-bold leading-none disabled:opacity-30 transition-opacity active:scale-90 ${L ? "text-[#C53030]" : "text-white/70"}`}
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
