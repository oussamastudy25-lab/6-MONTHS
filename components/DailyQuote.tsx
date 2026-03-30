'use client'
import { useState, useEffect } from 'react'

const QUOTES = [
  { text: "Don't stop when you're tired. Stop when you're done.", author: "David Goggins" },
  { text: "You are in danger of living a life so comfortable and soft that you will die without ever realizing your true potential.", author: "David Goggins" },
  { text: "The most important conversations you'll ever have are the ones you'll have with yourself.", author: "David Goggins" },
  { text: "Everybody comes to a point in their life when they want to quit. But it's what you do at that moment that determines who you are.", author: "David Goggins" },
  { text: "We live in a world where when things get hard, we can order food to our door. Quitting has never been easier.", author: "David Goggins" },
  { text: "It's a lot more than mind over matter. It takes relentless self discipline, self motivation, and hard work.", author: "David Goggins" },
  { text: "No one is going to come help you. No one's coming to save you.", author: "David Goggins" },
  { text: "Suffering is the true test of life.", author: "David Goggins" },
  { text: "The only way you gain mental toughness is to do things you're not happy doing.", author: "David Goggins" },
  { text: "We have so much more inside of us. We don't tap into it.", author: "David Goggins" },
  { text: "You have to be willing to suffer to get what you want.", author: "David Goggins" },
  { text: "Your mind is your greatest weapon. Train it like you train your body.", author: "David Goggins" },
  { text: "The standard is the standard. Don't negotiate with mediocrity.", author: "David Goggins" },
  { text: "The difference between who you are and who you want to be is what you do.", author: "Alex Hormozi" },
  { text: "You don't rise to the level of your goals. You fall to the level of your systems.", author: "Alex Hormozi" },
  { text: "Work so hard that your heroes become your peers.", author: "Alex Hormozi" },
  { text: "Volume. Volume. Volume. Most people don't do enough.", author: "Alex Hormozi" },
  { text: "The pain of discipline weighs ounces. The pain of regret weighs tons.", author: "Alex Hormozi" },
  { text: "You can either be judged for being great or judged for being average. Either way you're judged.", author: "Alex Hormozi" },
  { text: "Short-term pain. Long-term gain. Always.", author: "Alex Hormozi" },
  { text: "Stop waiting for the right moment. The right moment is now.", author: "Alex Hormozi" },
  { text: "Rich people have big libraries. Poor people have big TVs.", author: "Alex Hormozi" },
  { text: "Speed is the ultimate competitive advantage.", author: "Alex Hormozi" },
  { text: "The fastest way to change your life is to stop doing things that don't serve you.", author: "Alex Hormozi" },
  { text: "إِنَّ مَعَ الْعُسْرِ يُسْرًا — Indeed, with hardship comes ease.", author: "Quran 94:6" },
  { text: "وَلَا تَهِنُوا وَلَا تَحْزَنُوا وَأَنتُمُ الْأَعْلَوْنَ — Do not weaken, do not grieve. You are superior.", author: "Quran 3:139" },
  { text: "إِنَّ اللَّهَ لَا يُغَيِّرُ مَا بِقَوْمٍ حَتَّىٰ يُغَيِّرُوا مَا بِأَنفُسِهِمْ — Allah will not change a people until they change themselves.", author: "Quran 13:11" },
  { text: "وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ — Whoever relies upon Allah, He is sufficient for him.", author: "Quran 65:3" },
  { text: "فَإِذَا فَرَغْتَ فَانصَبْ — When you have finished your work, stand up for worship.", author: "Quran 94:7" },
  { text: "وَاسْتَعِينُوا بِالصَّبْرِ وَالصَّلَاةِ — Seek help through patience and prayer.", author: "Quran 2:45" },
  { text: "وَأَن لَّيْسَ لِلْإِنسَانِ إِلَّا مَا سَعَىٰ — Man will only have what he strives for.", author: "Quran 53:39" },
  { text: "صَلِّ صَلَاةَ مُوَدِّعٍ — Pray as if it is your last prayer.", author: "Ibn Majah" },
  { text: "Discipline equals freedom.", author: "Jocko Willink" },
  { text: "Don't count the days. Make the days count.", author: "Muhammad Ali" },
  { text: "The man who moves a mountain begins by carrying away small stones.", author: "Confucius" },
  { text: "One day or day one. You decide.", author: "Unknown" },
  { text: "Champions become champions because of their habits before the event.", author: "Unknown" },
  { text: "Hard work beats talent when talent doesn't work hard.", author: "Tim Notke" },
  { text: "Don't wish it were easier. Wish you were better.", author: "Jim Rohn" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "If you are not willing to risk the unusual, you will have to settle for the ordinary.", author: "Jim Rohn" },
  { text: "We suffer more in imagination than in reality.", author: "Seneca" },
  { text: "He who is not courageous enough to take risks will accomplish nothing in life.", author: "Muhammad Ali" },
  { text: "A year from now you will wish you had started today.", author: "Karen Lamb" },
  { text: "The only limit to our realization of tomorrow is our doubts of today.", author: "Franklin D. Roosevelt" },
  { text: "What you do today can improve all your tomorrows.", author: "Ralph Marston" },
  { text: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky" },
  { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
  { text: "Success is the sum of small efforts repeated day in and day out.", author: "Robert Collier" },
  { text: "The secret of your future is hidden in your daily routine.", author: "Mike Murdock" },
]

export default function DailyQuote() {
  // Changes every hour — use current hour + minute/10 for sub-hour changes
  const [idx, setIdx] = useState(() => {
    const now = new Date()
    const seed = now.getFullYear() * 100000 + now.getMonth() * 10000 + now.getDate() * 100 + now.getHours()
    return seed % QUOTES.length
  })

  useEffect(() => {
    // Update every 30 minutes
    const update = () => {
      const now = new Date()
      const seed = now.getFullYear() * 100000 + now.getMonth() * 10000 + now.getDate() * 100 + now.getHours() * 2 + Math.floor(now.getMinutes() / 30)
      setIdx(seed % QUOTES.length)
    }

    // Check every minute if we need to rotate
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
