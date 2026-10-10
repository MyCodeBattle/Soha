const DISNEY_ANIMAL_NAMES = [
  'Simba', 'Nala', 'Mufasa', 'Scar', 'Timon', 'Pumbaa', 'Rafiki', 'Zazu',
  'Judy', 'Nick', 'Nemo', 'Marlin', 'Dory', 'Bruce', 'Crush', 'Squirt',
  'Hank', 'Bailey', 'Destiny', 'Remy',
] as const;

export function generateRandomNickname(currentName?: string): string {
  const candidates = DISNEY_ANIMAL_NAMES.filter((name) => name !== currentName);
  return candidates[Math.floor(Math.random() * candidates.length)];
}
