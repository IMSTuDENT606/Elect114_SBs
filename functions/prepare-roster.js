const { readFileSync, writeFileSync } = require('node:fs');
const bcrypt = require('bcryptjs');

async function prepareRoster() {
  const input = process.argv[2] ?? 'voters.private.json';
  const rows = JSON.parse(readFileSync(input, 'utf8'));
  if (!Array.isArray(rows) || !rows.length) throw new Error('No voter records');
  const voters = {};
  const eligible = {};
  for (const [index, row] of rows.entries()) {
    const { studentId, name, room, number } = row ?? {};
    const roomNumber = typeof room === 'string' && /^[มป]\.\d{1,2}\/([1-9]\d?)$/.exec(room)?.[1];
    if (typeof studentId !== 'string' || !/^\d{5}$/.test(studentId) || Object.hasOwn(voters, studentId) ||
        typeof name !== 'string' || !name.trim() || !roomNumber ||
        !Number.isInteger(number) || number < 1 || number > 99) {
      throw new Error(`Invalid or duplicate voter at row ${index + 1}`);
    }
    const password = row.password ?? `114${roomNumber}${String(number).padStart(2, '0')}`;
    if (typeof password !== 'string' || !/^\d{6,7}$/.test(password)) {
      throw new Error(`Invalid PIN at row ${index + 1}`);
    }
    voters[studentId] = { name: name.trim(), room, number, passwordHash: await bcrypt.hash(password, 12), enabled: true };
    eligible[studentId] = true;
  }
  writeFileSync('voters-import.private.json', JSON.stringify({ privateVoters: voters, eligible }, null, 2), {
    flag: 'wx', mode: 0o600
  });
  console.log(`Prepared ${rows.length} private voter records.`);
}

prepareRoster().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
