import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/db.js';
import { config } from '../src/config.js';

console.log('Seeding initial noticeboard database...');

// Ensure data and uploads directory exist
fs.mkdirSync(config.uploadsDir, { recursive: true });

// Check existing announcements
const countAnnouncements = db.prepare('SELECT COUNT(*) as c FROM announcements').get().c;

if (countAnnouncements === 0) {
  const insertAnnouncement = db.prepare(`
    INSERT INTO announcements (category, title, body, pinned, author, posted_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const oneDay = 24 * oneHour;

  // 1. Pinned urgent announcement
  insertAnnouncement.run(
    'Exam',
    '🚨 Mid-Semester Examination Schedule & Room Allocations Released',
    'The Mid-Semester examinations commence starting next Monday. All students must report to their assigned examination halls 20 minutes prior to the commencement of the exam. Mobile phones and programmable calculators are strictly prohibited in the exam hall.\n\nAdmit cards must be signed and stamped by the respective department heads by Friday 4:00 PM.',
    1,
    'Controller of Examinations',
    new Date(now - 2 * oneHour).toISOString()
  );

  // 2. Academic related
  insertAnnouncement.run(
    'Academic Related',
    'Lab Submissions Deadline Extended for CS & IT Branches',
    'Due to the server maintenance scheduled over the weekend, the submission deadline for Database Management Systems (DBMS) and Operating Systems (OS) lab assignments has been extended to Wednesday, 11:59 PM. Please push your git commits before the cutoff.',
    0,
    'HOD Computer Science',
    new Date(now - 5 * oneHour).toISOString()
  );

  // 3. Holiday announcement
  insertAnnouncement.run(
    'Holiday',
    'College Holiday Announcement - National Science Day',
    'The institution will observe a non-instructional holiday this coming Friday on the occasion of National Science Day. College library and reading halls will remain open from 9:00 AM to 5:00 PM for self-study.',
    0,
    'Dean Student Affairs',
    new Date(now - 1 * oneDay).toISOString()
  );

  // 4. General
  insertAnnouncement.run(
    'General',
    'Annual Cultural & Technical Fest Volunteer Registration',
    'Registrations for student coordinators and event volunteers are now open. Interested students from 2nd and 3rd year can submit their nominations at the Student Council office before 5 PM this Thursday.',
    0,
    'Student Council',
    new Date(now - 2 * oneDay).toISOString()
  );

  console.log('✓ Seeded 4 demo announcements');
} else {
  console.log(`Announcements already exist (${countAnnouncements} found). Skipping announcements seed.`);
}

// Seed sample syllabus posts if empty
const countSyllabus = db.prepare('SELECT COUNT(*) as c FROM syllabus_posts').get().c;

if (countSyllabus === 0) {
  // Create a clean lightweight SVG placeholder saved as a file for current week & archive
  const createSvg = (title, week, topics) => `
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#000000" />
          <stop offset="100%" stop-color="#111114" />
        </linearGradient>
      </defs>
      <rect width="900" height="600" fill="url(#bg)" rx="16" />
      <rect x="30" y="30" width="840" height="540" fill="none" stroke="#222227" stroke-width="2" rx="12" />
      <text x="60" y="90" font-family="system-ui, sans-serif" font-size="28" font-weight="700" fill="#f59e0b">WEEKLY EXAM SYLLABUS</text>
      <text x="60" y="130" font-family="system-ui, sans-serif" font-size="20" font-weight="600" fill="#ffffff">${week}</text>
      <line x1="60" y1="160" x2="840" y2="160" stroke="#222227" stroke-width="2" />
      
      <text x="60" y="210" font-family="system-ui, sans-serif" font-size="20" font-weight="700" fill="#fbbf24">Subject 1: Data Structures &amp; Algorithms</text>
      <text x="80" y="245" font-family="system-ui, sans-serif" font-size="16" fill="#a1a1aa">• Graph traversals (BFS, DFS), Shortest Path (Dijkstra, Bellman-Ford)</text>
      <text x="80" y="275" font-family="system-ui, sans-serif" font-size="16" fill="#a1a1aa">• Minimum Spanning Trees (Prim, Kruskal), Topological Sorting</text>
      
      <text x="60" y="335" font-family="system-ui, sans-serif" font-size="20" font-weight="700" fill="#34d399">Subject 2: Database Management Systems</text>
      <text x="80" y="370" font-family="system-ui, sans-serif" font-size="16" fill="#a1a1aa">• ACID properties, Concurrency Control, Two-Phase Locking (2PL)</text>
      <text x="80" y="400" font-family="system-ui, sans-serif" font-size="16" fill="#a1a1aa">• Normalization up to BCNF, Relational Algebra queries</text>

      <text x="60" y="460" font-family="system-ui, sans-serif" font-size="20" font-weight="700" fill="#fbbf24">Subject 3: Computer Networks</text>
      <text x="80" y="495" font-family="system-ui, sans-serif" font-size="16" fill="#a1a1aa">• TCP 3-way handshake, Flow control (Sliding window), Congestion control</text>
      
      <text x="60" y="550" font-family="system-ui, sans-serif" font-size="13" fill="#71717a">Student Bulletin &amp; Academic Desk</text>
    </svg>
  `.trim();

  // Save current week syllabus
  const currFile = 'syllabus-current-week-12.svg';
  fs.writeFileSync(path.join(config.uploadsDir, currFile), createSvg('Exam Syllabus', 'Week 12 (Mar 23 - Mar 29, 2026)', []));

  // Save previous week syllabus
  const prevFile = 'syllabus-archive-week-11.svg';
  fs.writeFileSync(path.join(config.uploadsDir, prevFile), createSvg('Exam Syllabus', 'Week 11 (Mar 16 - Mar 22, 2026)', []));

  const insertSyllabus = db.prepare(`
    INSERT INTO syllabus_posts (week_label, image_url, posted_at)
    VALUES (?, ?, ?)
  `);

  const now = Date.now();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;

  insertSyllabus.run('Week 12 (Current - Mar 23 to Mar 29, 2026)', `/uploads/${currFile}`, new Date(now).toISOString());
  insertSyllabus.run('Week 11 (Mar 16 to Mar 22, 2026)', `/uploads/${prevFile}`, new Date(now - oneWeek).toISOString());

  console.log('✓ Seeded current week and archived syllabus');
} else {
  console.log(`Syllabus posts already exist (${countSyllabus} found). Skipping syllabus seed.`);
}

// Seed sample Phase Test if empty
const countPhaseTests = db.prepare('SELECT COUNT(*) as c FROM phase_tests').get().c;

if (countPhaseTests === 0) {
  const insertPhase = db.prepare(`
    INSERT INTO phase_tests (title, phase_label, description, attachment_url, attachment_name, exam_date, posted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertPhase.run(
    'Phase Test 1 - Consolidated Curriculum Assessment',
    'Phase 1 Examination',
    'Major milestone exam conducted every 2-3 months. Covers consolidated curriculum for Units 1 to 4 across all core subjects.\n\n• Exam Format: Theory (70%) + Practical application (30%)\n• Hall Ticket: Mandatory; admit card verification at the exam hall.\n• Reporting Time: 30 minutes prior to session start.',
    '/uploads/syllabus-current-week-12.svg',
    'Phase-1-Consolidated-Portions.svg',
    'Oct 20 – Oct 25, 2026',
    new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  );

  console.log('✓ Seeded demo Phase Test');
} else {
  console.log(`Phase Tests already exist (${countPhaseTests} found). Skipping phase test seed.`);
}

// Seed sample Answer Keys if empty
const countAnswerKeys = db.prepare('SELECT COUNT(*) as c FROM answer_keys').get().c;

if (countAnswerKeys === 0) {
  // Create sample SVG answer keys for Set A and Set B
  const createKeySvg = (setName, testName) => `
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
      <rect width="800" height="500" fill="#09090b" rx="12" />
      <rect x="20" y="20" width="760" height="460" fill="none" stroke="#26262e" stroke-width="2" rx="8" />
      <text x="50" y="70" font-family="system-ui, sans-serif" font-size="24" font-weight="700" fill="#f59e0b">OFFICIAL ANSWER KEY &amp; SOLUTIONS</text>
      <text x="50" y="110" font-family="system-ui, sans-serif" font-size="18" font-weight="600" fill="#ffffff">${testName} — ${setName}</text>
      <line x1="50" y1="135" x2="750" y2="135" stroke="#26262e" stroke-width="2" />
      
      <text x="50" y="180" font-family="monospace" font-size="16" fill="#fbbf24">Q1: (B)  Q2: (A)  Q3: (D)  Q4: (C)  Q5: (B)</text>
      <text x="50" y="220" font-family="monospace" font-size="16" fill="#fbbf24">Q6: (A)  Q7: (C)  Q8: (B)  Q9: (D)  Q10: (A)</text>
      <text x="50" y="260" font-family="monospace" font-size="16" fill="#fbbf24">Q11: (C) Q12: (D) Q13: (A) Q14: (B) Q15: (C)</text>
      <text x="50" y="300" font-family="monospace" font-size="16" fill="#fbbf24">Q16: (D) Q17: (A) Q18: (B) Q19: (C) Q20: (D)</text>
      
      <text x="50" y="370" font-family="system-ui, sans-serif" font-size="14" fill="#a1a1aa">• Discrepancies can be challenged within 48 hours of publication.</text>
      <text x="50" y="400" font-family="system-ui, sans-serif" font-size="14" fill="#a1a1aa">• Scoring: +4 for correct option, -1 for incorrect option.</text>
      <text x="50" y="450" font-family="system-ui, sans-serif" font-size="12" fill="#71717a">Department Examination Board • Verified Master Key</text>
    </svg>
  `.trim();

  const fileA = 'sample-answer-key-set-a.svg';
  const fileB = 'sample-answer-key-set-b.svg';
  fs.writeFileSync(path.join(config.uploadsDir, fileA), createKeySvg('Set A', 'Mid-Term Exam: Computer Networks'));
  fs.writeFileSync(path.join(config.uploadsDir, fileB), createKeySvg('Set B', 'Mid-Term Exam: Computer Networks'));

  const insertKey = db.prepare(`
    INSERT INTO answer_keys (title, test_date, subject, description, set_a_url, set_a_name, set_b_url, set_b_name, is_archived, posted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `);

  insertKey.run(
    'Mid-Semester Examination: Computer Networks & Protocols',
    'Mar 24, 2026',
    'Computer Science & Engineering',
    'Official solutions for the mid-semester examination held on March 24. Both Set A and Set B keys have been vetted by the subject committee. Students may challenge any question answer with reference documentation before Friday 5 PM.',
    `/uploads/${fileA}`,
    'Networks-MidTerm-Key-SetA.svg',
    `/uploads/${fileB}`,
    'Networks-MidTerm-Key-SetB.svg',
    new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
  );

  console.log('✓ Seeded demo Answer Keys (Set A & Set B)');
} else {
  console.log(`Answer Keys already exist (${countAnswerKeys} found). Skipping answer keys seed.`);
}

console.log('Seeding finished successfully.');
