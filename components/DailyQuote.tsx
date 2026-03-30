'use client'

const QUOTES = [
  { text: "Don't stop when you're tired. Stop when you're done.", author: "David Goggins" },
  { text: "You are in danger of living a life so comfortable and soft that you will die without ever realizing your true potential.", author: "David Goggins" },
  { text: "The most important conversations you'll ever have are the ones you'll have with yourself.", author: "David Goggins" },
  { text: "Everybody comes to a point in their life when they want to quit. But it's what you do at that moment that determines who you are.", author: "David Goggins" },
  { text: "We live in a world where when things get hard, we can order Uber Eats. Quitting has never been easier.", author: "David Goggins" },
  { text: "You will never learn from people if you always interrupt them.", author: "David Goggins" },
  { text: "It's a lot more than mind over matter. It takes relentless self discipline, self motivation, and hard work.", author: "David Goggins" },
  { text: "No one is going to come help you. No one's coming to save you.", author: "David Goggins" },
  { text: "Suffering is the true test of life.", author: "David Goggins" },
  { text: "The only way you gain mental toughness is to do things you're not happy doing.", author: "David Goggins" },
  { text: "The biggest thing that I learned is that we have so much more inside of us. We don't tap into it.", author: "David Goggins" },
  { text: "Make your choices reflect your hopes, not your fears.", author: "Nelson Mandela" },
  { text: "The difference between who you are and who you want to be is what you do.", author: "Alex Hormozi" },
  { text: "You don't rise to the level of your goals. You fall to the level of your systems.", author: "Alex Hormozi" },
  { text: "The fastest way to change your life is to stop doing things that don't serve you.", author: "Alex Hormozi" },
  { text: "Work so hard that your heroes become your peers.", author: "Alex Hormozi" },
  { text: "Rich people have big libraries. Poor people have big TVs.", author: "Alex Hormozi" },
  { text: "Stop waiting for the right moment. The right moment is now.", author: "Alex Hormozi" },
  { text: "Volume. Volume. Volume. Most people don't do enough.", author: "Alex Hormozi" },
  { text: "The pain of discipline weighs ounces. The pain of regret weighs tons.", author: "Alex Hormozi" },
  { text: "You can either be judged for being great or judged for being average. Either way you're going to be judged.", author: "Alex Hormozi" },
  { text: "إِنَّ مَعَ الْعُسْرِ يُسْرًا — Indeed, with hardship comes ease.", author: "Quran 94:6" },
  { text: "وَلَا تَهِنُوا وَلَا تَحْزَنُوا وَأَنتُمُ الْأَعْلَوْنَ — Do not weaken and do not grieve, and you will be superior.", author: "Quran 3:139" },
  { text: "إِنَّ اللَّهَ لَا يُغَيِّرُ مَا بِقَوْمٍ حَتَّىٰ يُغَيِّرُوا مَا بِأَنفُسِهِمْ — Allah will not change the condition of a people until they change themselves.", author: "Quran 13:11" },
  { text: "وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ — Whoever relies upon Allah, He is sufficient for him.", author: "Quran 65:3" },
  { text: "فَإِذَا فَرَغْتَ فَانصَبْ — When you have finished your work, stand up for worship.", author: "Quran 94:7" },
  { text: "وَاسْتَعِينُوا بِالصَّبْرِ وَالصَّلَاةِ — Seek help through patience and prayer.", author: "Quran 2:45" },
  { text: "Hard work beats talent when talent doesn't work hard.", author: "Tim Notke" },
  { text: "One day or day one. You decide.", author: "Unknown" },
  { text: "The man who moves a mountain begins by carrying away small stones.", author: "Confucius" },
  { text: "Discipline equals freedom.", author: "Jocko Willink" },
  { text: "Don't count the days. Make the days count.", author: "Muhammad Ali" },
  { text: "You have to be willing to suffer to get what you want.", author: "David Goggins" },
  { text: "وَأَن لَّيْسَ لِلْإِنسَانِ إِلَّا مَا سَعَىٰ — Man will only have what he strives for.", author: "Quran 53:39" },
  { text: "The standard is the standard.", author: "Mike Tomlin" },
  { text: "Don't wish it were easier. Wish you were better.", author: "Jim Rohn" },
  { text: "Your mind is your greatest weapon. Train it.", author: "David Goggins" },
  { text: "Short-term pain. Long-term gain. Always.", author: "Alex Hormozi" },
  { text: "Champions do not become champions when they win. They become champions because of their habits before the event.", author: "Unknown" },
  { text: "صَلِّ صَلَاةَ مُوَدِّعٍ — Pray as if it is your last prayer.", author: "Ibn Majah" },
]

export default function DailyQuote() {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000)
  const quote = QUOTES[dayOfYear % QUOTES.length]

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
