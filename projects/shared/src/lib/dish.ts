/**
 * Nhận ra tên món trong tên quán (ví dụ "Bánh cuốn Thanh Trì" → "bánh cuốn"), dùng để tự tìm ảnh
 * minh hoạ. Hàm thuần, chạy được cả trình duyệt lẫn Node.
 *
 * Mỗi dòng: dạng chuẩn có dấu, theo sau (nếu có, ngăn bằng "|") là các cách viết khác.
 */
const DISHES: readonly string[] = [
  // Bánh
  'bánh cuốn', 'bánh mì|bánh mỳ', 'bánh xèo', 'bánh canh', 'bánh bèo', 'bánh bao', 'bánh ướt',
  'bánh tráng nướng', 'bánh tráng trộn', 'bánh tráng cuốn', 'bánh flan', 'bánh bột lọc',
  'bánh khọt', 'bánh căn', 'bánh chưng', 'bánh giò', 'bánh gối', 'bánh đúc', 'bánh hỏi',
  'bánh khoái', 'bánh nậm', 'bánh ít', 'bánh pía', 'bánh tiêu', 'bánh rán', 'bánh kem',
  // Bún, phở, mì, miến
  'bún bò huế', 'bún bò', 'bún chả cá', 'bún chả', 'bún riêu', 'bún đậu mắm tôm', 'bún đậu',
  'bún mắm', 'bún thịt nướng', 'bún cá', 'bún ốc', 'bún mọc', 'bún quậy', 'bún kèn', 'bún',
  'phở bò', 'phở gà', 'phở', 'hủ tiếu|hủ tíu|hủ tiếu nam vang', 'mì quảng', 'mì cay', 'mì ý',
  'mì vịt tiềm', 'mì', 'miến gà', 'miến', 'cao lầu', 'nui',
  // Cơm, xôi, cháo, súp
  'cơm tấm', 'cơm gà', 'cơm niêu', 'cơm chiên', 'cơm hến', 'cơm chay', 'cơm', 'xôi',
  'cháo lòng', 'cháo', 'súp cua',
  // Lẩu, nướng, nhậu
  'lẩu thái', 'lẩu', 'đồ nướng', 'nướng|bbq', 'gỏi cuốn', 'gỏi cá trích', 'gỏi', 'nem nướng',
  'nem rán', 'nem', 'chả giò', 'chả cá', 'bò né', 'bò kho', 'bò lá lốt', 'bò bít tết|bít tết|beefsteak',
  'bê thui', 'vịt quay', 'heo quay', 'gà nướng', 'gà rán', 'phá lấu', 'ốc', 'ghẹ', 'cua', 'tôm hùm',
  'nhum|cầu gai', 'mực nướng', 'hải sản|seafood', 'đồ chay|quán chay',
  // Đồ uống, tráng miệng
  'cà phê|cafe|café|coffee|cà fê|caphe', 'trà sữa|milk tea', 'trà đào', 'trà chanh',
  'nước mía', 'nước ép', 'sinh tố', 'sữa chua', 'tàu hũ|tào phớ|đậu hũ nước đường', 'chè', 'kem',
  'rau má', 'bia', 'cocktail',
  // Món ngoại
  'sushi', 'ramen', 'kimbap|gimbap', 'tokbokki|tteokbokki', 'dimsum|dim sum', 'pizza',
  'burger|hamburger', 'pasta|spaghetti',
];

interface Entry {
  canonical: string;
  tokens: string[];
}

function stripMarks(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

function tokenize(text: string): string[] {
  return text.normalize('NFC').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

const ENTRIES: readonly Entry[] = DISHES.flatMap((line) => {
  const forms = line.split('|');
  return forms.map((form) => ({ canonical: forms[0]!, tokens: tokenize(form) }));
});

/**
 * Từ gõ không dấu thì khớp mọi dạng dấu ("pho" khớp "phở"). Từ đã có dấu thì phải đúng dấu, để
 * "Phố" không bị hiểu là "phở", "Chào" không thành "cháo".
 */
function sameWord(typed: string, expected: string): boolean {
  if (typed === expected) return true;
  const plain = stripMarks(typed);
  return plain === typed && plain === stripMarks(expected);
}

function findAt(words: string[], tokens: string[]): number {
  for (let i = 0; i + tokens.length <= words.length; i++) {
    if (tokens.every((t, j) => sameWord(words[i + j]!, t))) return i;
  }
  return -1;
}

/**
 * Trả về tên món (dạng chuẩn có dấu) trong tên quán, hoặc null. Khớp theo ranh giới từ, không phân
 * biệt hoa thường. Nhiều món cùng khớp thì lấy cụm nhiều từ nhất, rồi dài nhất, rồi đứng trước.
 */
export function extractDish(name: string): string | null {
  const words = tokenize(name);
  let best: { canonical: string; words: number; chars: number; at: number } | null = null;
  for (const entry of ENTRIES) {
    const at = findAt(words, entry.tokens);
    if (at < 0) continue;
    const found = {
      canonical: entry.canonical,
      words: entry.tokens.length,
      chars: entry.tokens.join(' ').length,
      at,
    };
    const better =
      !best ||
      found.words > best.words ||
      (found.words === best.words &&
        (found.chars > best.chars || (found.chars === best.chars && found.at < best.at)));
    if (better) best = found;
  }
  return best?.canonical ?? null;
}
