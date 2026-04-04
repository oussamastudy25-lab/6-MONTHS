'use client'
import { useState, useEffect } from 'react'

const QUOTES = [
  // ── ACTION & URGENCY ────────────────────────────────────────────────
  { text: "Don't stop when you're tired. Stop when you're done.", author: "David Goggins" },
  { text: "Motion beats meditation. Start now, think later.", author: "Alex Hormozi" },
  { text: "You don't need more information. You need more action.", author: "Alex Hormozi" },
  { text: "Clarity comes from action, not thought.", author: "Alex Hormozi" },
  { text: "The cost of doing nothing is always higher than the cost of doing something.", author: "Alex Hormozi" },
  { text: "Stop waiting for the right moment. The right moment is now.", author: "Alex Hormozi" },
  { text: "Speed is the ultimate competitive advantage.", author: "Alex Hormozi" },
  { text: "Every day you delay is a day you give to your competition.", author: "Unknown" },
  { text: "Done is better than perfect. You can't improve something that doesn't exist.", author: "Unknown" },
  { text: "One day or day one. You decide.", author: "Unknown" },
  { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
  { text: "A year from now you will wish you had started today.", author: "Karen Lamb" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },

  // ── STRATEGY & THINKING ─────────────────────────────────────────────
  { text: "Work on the right things, not just more things.", author: "Unknown" },
  { text: "Complexity is the enemy of execution. Simplify everything.", author: "Tony Robbins" },
  { text: "Strategy without execution is a hallucination.", author: "Thomas Edison" },
  { text: "Give me six hours to chop down a tree and I will spend the first four sharpening the axe.", author: "Abraham Lincoln" },
  { text: "You don't rise to the level of your goals. You fall to the level of your systems.", author: "James Clear" },
  { text: "The quality of your decisions determines the quality of your life.", author: "Unknown" },
  { text: "Outwork. Outthink. Outlearn. Pick two and you'll beat almost everyone.", author: "Unknown" },
  { text: "Most people overestimate what they can do in a day and underestimate what they can do in a year.", author: "Bill Gates" },
  { text: "Slow down to speed up. Plan your attack before the battle.", author: "Unknown" },
  { text: "If you don't know where you're going, any road will take you there.", author: "Lewis Carroll" },
  { text: "Your strategy is only as good as your daily execution of it.", author: "Unknown" },
  { text: "The map is not the territory. Test your assumptions in the real world.", author: "Alfred Korzybski" },
  { text: "First-principles thinking: forget what exists. Ask what must be true.", author: "Elon Musk" },
  { text: "Winners have plans. Losers have excuses.", author: "Unknown" },
  { text: "Ask better questions. Better questions produce better answers.", author: "Tony Robbins" },

  // ── NEW IDEAS & INNOVATION ───────────────────────────────────────────
  { text: "The person who solves a problem others ignore will own the future.", author: "Unknown" },
  { text: "Innovation is seeing what everybody has seen and thinking what nobody has thought.", author: "Albert Szent-Györgyi" },
  { text: "Your next breakthrough idea is hiding in a problem you've been avoiding.", author: "Unknown" },
  { text: "Good ideas are everywhere. Great execution is rare.", author: "Unknown" },
  { text: "The biggest opportunities are disguised as obvious problems nobody has bothered to solve.", author: "Unknown" },
  { text: "Study the market. Study human nature. The edge is always at the intersection.", author: "Unknown" },
  { text: "What if the opposite of your current approach is the correct one?", author: "Unknown" },
  { text: "The best ideas come from combining two fields nobody thought to connect.", author: "Unknown" },
  { text: "Read outside your field. That's where the breakthrough ideas live.", author: "Unknown" },
  { text: "To get new answers you've never had, ask questions you've never asked.", author: "Unknown" },
  { text: "Steal ideas shamelessly from unrelated industries. No one is watching.", author: "Unknown" },
  { text: "The most dangerous phrase: 'we've always done it this way'.", author: "Grace Hopper" },

  // ── DISCIPLINE & SYSTEMS ─────────────────────────────────────────────
  { text: "Discipline equals freedom.", author: "Jocko Willink" },
  { text: "We are what we repeatedly do. Excellence is not an act, but a habit.", author: "Aristotle" },
  { text: "You don't need motivation. You need a schedule.", author: "Unknown" },
  { text: "Your habits are voting for the person you want to become.", author: "James Clear" },
  { text: "Routine in an intelligent man is a sign of ambition.", author: "W.H. Auden" },
  { text: "The difference between a professional and an amateur is that the professional shows up even when they don't feel like it.", author: "Steven Pressfield" },
  { text: "The only way to do great work is to not negotiate with your standards.", author: "Unknown" },
  { text: "Volume. Volume. Volume. Most people don't do enough.", author: "Alex Hormozi" },
  { text: "Success is the sum of small efforts repeated day in and day out.", author: "Robert Collier" },
  { text: "The pain of discipline weighs ounces. The pain of regret weighs tons.", author: "Alex Hormozi" },
  { text: "Champions become champions because of their habits before the event.", author: "Unknown" },
  { text: "Fall in love with the process and the results will come.", author: "Unknown" },

  // ── MINDSET & MENTAL WARFARE ─────────────────────────────────────────
  { text: "Your mind is the battlefield. Win there first.", author: "David Goggins" },
  { text: "The only enemy you'll ever face is the one in your head.", author: "David Goggins" },
  { text: "You have so much more inside of you. You haven't tapped 40% of it yet.", author: "David Goggins" },
  { text: "Suffering is the true test of life.", author: "David Goggins" },
  { text: "Comfort is the enemy of growth.", author: "David Goggins" },
  { text: "Hard work beats talent when talent doesn't work hard.", author: "Tim Notke" },
  { text: "Don't wish it were easier. Wish you were better.", author: "Jim Rohn" },
  { text: "The only limit to our realization of tomorrow is our doubts of today.", author: "Franklin D. Roosevelt" },
  { text: "We suffer more in imagination than in reality.", author: "Seneca" },
  { text: "Do not pray for an easy life. Pray for the strength to endure a difficult one.", author: "Bruce Lee" },
  { text: "If it doesn't challenge you, it doesn't change you.", author: "Fred DeVito" },
  { text: "Your current situation is not your final destination.", author: "Unknown" },
  { text: "Pain is temporary. Quitting lasts forever.", author: "Lance Armstrong" },

  // ── FOCUS & DEEP WORK ────────────────────────────────────────────────
  { text: "Deep work is the superpower of the 21st century. Most people are too distracted to develop it.", author: "Cal Newport" },
  { text: "Attention is the most scarce and valuable resource you have. Guard it ferociously.", author: "Unknown" },
  { text: "The ability to focus is becoming rare. It is also becoming more valuable.", author: "Cal Newport" },
  { text: "Multitasking is a lie. Single-task with everything you have.", author: "Gary Keller" },
  { text: "Busyness is not productivity. Most busy people are hiding from the important work.", author: "Unknown" },
  { text: "One hour of focused work is worth more than eight hours of distracted effort.", author: "Unknown" },
  { text: "Protect your mornings. They are your most productive hours. Don't give them away.", author: "Unknown" },
  { text: "The phone can wait. The work cannot.", author: "Unknown" },
  { text: "What you allow in your environment determines what you accomplish in your life.", author: "Unknown" },

  // ── COMPETITION & AMBITION ───────────────────────────────────────────
  { text: "Work so hard that your heroes become your peers.", author: "Alex Hormozi" },
  { text: "Someone somewhere is outworking you right now. Make sure it isn't in the same field.", author: "Unknown" },
  { text: "You can either be judged for being great or judged for being average. Either way you're judged.", author: "Alex Hormozi" },
  { text: "The difference between who you are and who you want to be is what you do.", author: "Alex Hormozi" },
  { text: "Mediocrity is the most expensive thing you'll ever choose.", author: "Unknown" },
  { text: "If your dreams don't scare you, they're not big enough.", author: "Muhammad Ali" },
  { text: "He who is not courageous enough to take risks will accomplish nothing in life.", author: "Muhammad Ali" },
  { text: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky" },
  { text: "Play to win, not to not lose. There's a massive difference.", author: "Unknown" },
  { text: "Think bigger. Your ceiling is someone else's floor.", author: "Unknown" },

  // ── LEARNING & GROWTH ────────────────────────────────────────────────
  { text: "Rich people have big libraries. Poor people have big TVs.", author: "Jim Rohn" },
  { text: "Invest in yourself. It's the highest-return investment you'll ever make.", author: "Warren Buffett" },
  { text: "Every expert was once a beginner who refused to quit.", author: "Unknown" },
  { text: "The man who does not read has no advantage over the man who cannot.", author: "Mark Twain" },
  { text: "Knowledge is power only if you apply it. Information without action is just entertainment.", author: "Unknown" },
  { text: "Learn from everyone. Follow no one. Copy nothing. Build your own thing.", author: "Unknown" },
  { text: "The more you learn, the more you earn.", author: "Warren Buffett" },
  { text: "Fail fast. Learn faster. Move on fastest.", author: "Unknown" },
  { text: "Your biggest asset is your ability to learn and adapt. Never stop sharpening it.", author: "Unknown" },

  // ── QURAN & FAITH ────────────────────────────────────────────────────
  { text: "إِنَّ مَعَ الْعُسْرِ يُسْرًا — Indeed, with hardship comes ease.", author: "Quran 94:6" },
  { text: "وَلَا تَهِنُوا وَلَا تَحْزَنُوا وَأَنتُمُ الْأَعْلَوْنَ — Do not weaken, do not grieve. You are superior.", author: "Quran 3:139" },
  { text: "إِنَّ اللَّهَ لَا يُغَيِّرُ مَا بِقَوْمٍ حَتَّىٰ يُغَيِّرُوا مَا بِأَنفُسِهِمْ — Allah will not change a people until they change themselves.", author: "Quran 13:11" },
  { text: "وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ — Whoever relies upon Allah, He is sufficient for him.", author: "Quran 65:3" },
  { text: "فَإِذَا فَرَغْتَ فَانصَبْ — When you have finished your work, stand up for worship.", author: "Quran 94:7" },
  { text: "وَاسْتَعِينُوا بِالصَّبْرِ وَالصَّلَاةِ — Seek help through patience and prayer.", author: "Quran 2:45" },
  { text: "وَأَن لَّيْسَ لِلْإِنسَانِ إِلَّا مَا سَعَىٰ — Man will only have what he strives for.", author: "Quran 53:39" },
  { text: "حَسْبِيَ اللَّهُ وَنِعْمَ الْوَكِيلُ — Allah is sufficient for me, and He is the best disposer of affairs.", author: "Quran 3:173" },
  { text: "اللَّهُ مَعَ الصَّابِرِينَ — Allah is with those who are patient.", author: "Quran 2:153" },
  { text: "صَلِّ صَلَاةَ مُوَدِّعٍ — Pray as if it is your last prayer.", author: "Ibn Majah" },
  { text: "خَيْرُ النَّاسِ أَنفَعُهُم لِلنَّاسِ — The best of people are those most beneficial to people.", author: "Prophet Muhammad ﷺ" },
  { text: "اِعْمَلْ لِدُنيَاكَ كَأَنَّكَ تَعِيشُ أَبَدًا — Work for this world as if you live forever.", author: "Ibn Asakir" },

  // ── SHORT PUNCHERS ────────────────────────────────────────────────────
  { text: "Do more than is required. That's how you get ahead.", author: "George S. Patton" },
  { text: "The grind is the goal.", author: "Unknown" },
  { text: "Outlearn everyone in the room.", author: "Unknown" },
  { text: "Build something you're proud of. Every. Single. Day.", author: "Unknown" },
  { text: "How you do anything is how you do everything.", author: "Unknown" },
  { text: "Standards. Not goals. Goals end. Standards are forever.", author: "Unknown" },
  { text: "Win the morning. Win the day.", author: "Unknown" },
  { text: "The only real competition is who you were yesterday.", author: "Unknown" },
  { text: "Stay hungry. Stay humble. Stay dangerous.", author: "Unknown" },
  { text: "Make today so productive that yesterday gets jealous.", author: "Unknown" },
  { text: "Be so good they can't ignore you.", author: "Steve Martin" },
  { text: "Build fast. Learn faster. Adapt fastest.", author: "Unknown" },
]

export default function DailyQuote() {
  const [idx, setIdx] = useState(() => {
    const now = new Date()
    // Rotate every 10 minutes: 6 slots per hour
    const slot = Math.floor(now.getMinutes() / 10)
    const seed = now.getFullYear() * 1000000 + now.getMonth() * 100000 + now.getDate() * 1000 + now.getHours() * 6 + slot
    return seed % QUOTES.length
  })

  useEffect(() => {
    const update = () => {
      const now = new Date()
      const slot = Math.floor(now.getMinutes() / 10)
      const seed = now.getFullYear() * 1000000 + now.getMonth() * 100000 + now.getDate() * 1000 + now.getHours() * 6 + slot
      setIdx(seed % QUOTES.length)
    }
    // Check every minute
    const interval = setInterval(update, 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const quote = QUOTES[idx]

  return (
    <div className="bg-[#0A0A0A] border-b border-[#1E1E1E] px-6 py-4">
      <div className="text-[13px] text-white font-medium leading-relaxed italic max-w-2xl">
        "{quote.text}"
      </div>
      <div className="text-[10px] text-[#FF5C00] mt-1.5 tracking-[.08em] font-bold uppercase">
        — {quote.author}
      </div>
    </div>
  )
}
