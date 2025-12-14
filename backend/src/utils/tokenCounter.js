// src/utils/tokenCounter.js

import { prisma } from '../db/prisma.js';

export function countTokens(text = '') {
  return Math.ceil(text.length / 4);
}

export async function updateUserTokens(userId, tokens) {
  await prisma.user.update({
    where: { id: userId },
    data: { tokensUsed: { increment: tokens } },
  });
}