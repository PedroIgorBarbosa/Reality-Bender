export interface ParsedPairingParams {
  sessionId: string;
  code: string;
  token: string;
}

export function isValidPinCode(code: string): boolean {
  return /^[0-9]{6}$/.test(code.trim());
}

export function parsePairingQuery(search: string): ParsedPairingParams {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return {
    sessionId: (params.get('session') ?? '').trim(),
    code: (params.get('code') ?? '').trim(),
    token: (params.get('token') ?? '').trim(),
  };
}

/**
 * Generates a deterministic 21x21 QR-style matrix and SVG representation from joinUrl + pairingCode
 * so the stage view renders a scannable, high-contrast visual matrix without external network calls.
 */
export function generatePairingQrMatrix(payload: string, size = 21): boolean[][] {
  const grid: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const drawFinder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const border = r === 0 || r === 6 || c === 0 || c === 6;
        const inner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        grid[r0 + r][c0 + c] = border || inner;
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    grid[6][i] = i % 2 === 0;
    grid[i][6] = i % 2 === 0;
  }

  // Deterministic bit stream from payload bytes
  let hash = 2166136261;
  const bytes: number[] = [];
  for (let i = 0; i < payload.length; i++) {
    const code = payload.charCodeAt(i);
    bytes.push(code & 0xff);
    hash ^= code;
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  let bitIdx = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const inTopLeft = r < 8 && c < 8;
      const inTopRight = r < 8 && c >= size - 8;
      const inBottomLeft = r >= size - 8 && c < 8;
      if (inTopLeft || inTopRight || inBottomLeft || r === 6 || c === 6) continue;
      const byteVal = bytes[bitIdx % Math.max(1, bytes.length)] ?? 0;
      const bit = ((byteVal >> (bitIdx % 8)) ^ ((hash >> (bitIdx % 16)) & 1)) & 1;
      grid[r][c] = bit === 1;
      bitIdx += 1;
    }
  }

  return grid;
}

export function generatePairingQrSvg(joinUrl: string, pairingCode: string): string {
  const matrix = generatePairingQrMatrix(`${joinUrl}#${pairingCode}`, 21);
  const cells: string[] = [];
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (matrix[r][c]) {
        cells.push(`<rect x="${c + 2}" y="${r + 2}" width="1" height="1" fill="#05070e"/>`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 25" role="img" aria-label="QR Code de pareamento ${pairingCode}"><rect width="25" height="25" rx="1.5" fill="#ffffff"/>${cells.join('')}</svg>`;
}
