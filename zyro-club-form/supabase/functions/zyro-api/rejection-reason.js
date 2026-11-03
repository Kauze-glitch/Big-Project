export const DEFAULT_REJECTION_REASON =
  "Hiện tại CLB ưu tiên những bạn có thể sinh hoạt cùng nhóm lâu dài.";

export function resolveRejectionReason(value) {
  const reason = String(value ?? "").trim();
  if (!reason) return DEFAULT_REJECTION_REASON;
  if (reason.length < 5) {
    throw new Error("Lý do riêng cần có ít nhất 5 ký tự.");
  }
  return reason;
}
