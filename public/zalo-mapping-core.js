const FORM_GENDER_TO_DRAFT = Object.freeze({
  male: "Male",
  female: "Female",
});

const FORM_POSITION_TO_DRAFT = Object.freeze({
  attacker: "Attack",
  defender: "Defense",
  setter: "Setter",
  allrounder: "FullStack",
});

const FORM_LEVEL_TO_DRAFT = Object.freeze({
  newbie: "New",
  intermediate: "Average",
  good: "Good",
});

export function normalizeZaloName(value) {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("vi-VN");
}

function foldName(value) {
  return normalizeZaloName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(left, right) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function nameSimilarity(leftValue, rightValue) {
  const left = foldName(leftValue);
  const right = foldName(rightValue);
  if (!left || !right) return 0;
  if (left === right) return 1;

  const editScore = 1 - levenshteinDistance(left, right) / Math.max(left.length, right.length);
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  const sharedTokens = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const tokenScore = sharedTokens / Math.max(leftTokens.size, rightTokens.size, 1);
  const substringScore = left.length >= 4 && right.length >= 4 && (left.includes(right) || right.includes(left)) ? 0.64 : 0;
  return Math.max(editScore, tokenScore * 0.92, substringScore);
}

function uniqueMembers(members) {
  const byUid = new Map();
  for (const member of Array.isArray(members) ? members : []) {
    const uid = String(member?.zaloUserId ?? "").trim();
    if (uid && !byUid.has(uid)) byUid.set(uid, { ...member, zaloUserId: uid });
  }
  return [...byUid.values()];
}

function exactCandidates(target, members) {
  return members.filter((member) =>
    [member.displayName, member.zaloName].some((name) => normalizeZaloName(name) === target)
  );
}

function similarCandidates(target, members) {
  return members
    .map((member) => ({ member, score: Math.max(
      nameSimilarity(target, member.displayName),
      nameSimilarity(target, member.zaloName),
    ) }))
    .filter((item) => item.score >= 0.5)
    .sort((left, right) => right.score - left.score || left.member.zaloUserId.localeCompare(right.member.zaloUserId))
    .slice(0, 6)
    .map(({ member, score }) => ({ ...member, matchScore: Number(score.toFixed(3)) }));
}

/**
 * Exact unique names may be preselected. Similar or duplicate names are suggestions only.
 * A previously saved UID always wins over a changed display name, but only while it is
 * still present in the currently selected group's verified directory.
 */
export function getZaloCandidates(registration, directoryMembers) {
  const members = uniqueMembers(directoryMembers);
  const target = normalizeZaloName(registration?.zaloName);
  const savedUid = String(registration?.zaloUserId ?? "").trim();

  if (savedUid) {
    const savedMember = members.find((member) => member.zaloUserId === savedUid);
    if (savedMember) {
      return {
        status: "saved",
        selectedUid: savedUid,
        candidates: [savedMember],
        needsConfirmation: false,
      };
    }

    const staleSuggestions = target ? exactCandidates(target, members) : [];
    return {
      status: "stale",
      selectedUid: "",
      candidates: staleSuggestions.length ? staleSuggestions : similarCandidates(target, members),
      needsConfirmation: true,
    };
  }

  if (!target) {
    return { status: "not-found", selectedUid: "", candidates: [], needsConfirmation: true };
  }

  const exact = exactCandidates(target, members);
  if (exact.length === 1) {
    return {
      status: "exact",
      selectedUid: exact[0].zaloUserId,
      candidates: exact,
      needsConfirmation: false,
    };
  }
  if (exact.length > 1) {
    return { status: "ambiguous", selectedUid: "", candidates: exact, needsConfirmation: true };
  }

  const similar = similarCandidates(target, members);
  return {
    status: similar.length ? "similar" : "not-found",
    selectedUid: "",
    candidates: similar,
    needsConfirmation: true,
  };
}

export function mapFormProfileToDraft(registration) {
  return {
    gender: FORM_GENDER_TO_DRAFT[registration?.gender] ?? null,
    role: FORM_POSITION_TO_DRAFT[registration?.position] ?? null,
    level: FORM_LEVEL_TO_DRAFT[registration?.level] ?? null,
  };
}

