# Travel Adda অ্যাপ: ধাপ ১ সেটআপ গাইড

এই ধাপে তিনটি ফ্রি অ্যাকাউন্ট খুলবেন এবং কয়েকটি জিনিস কপি-পেস্ট করবেন। কোনো প্রোগ্রামিং লাগবে না।

## ক. Supabase (ডাটাবেজ)
1. https://supabase.com এ গিয়ে **Start your project** চাপুন, কোম্পানির ইমেইল দিয়ে অ্যাকাউন্ট খুলুন।
2. **New project** চাপুন:
   - Name: `travel-adda`
   - Database Password: শক্ত একটা পাসওয়ার্ড দিন এবং নিরাপদে লিখে রাখুন (কাউকে দেবেন না, আমাকেও না)।
   - Region: **Southeast Asia (Singapore)** (বাংলাদেশের সবচেয়ে কাছে)।
3. প্রজেক্ট তৈরি হলে বাম মেনু থেকে **SQL Editor** খুলুন, **New query** চাপুন।
4. `supabase/001_core.sql` ফাইলটা খুলে পুরো লেখা কপি করে সেখানে পেস্ট করুন, তারপর **Run** চাপুন। নিচে "Success" দেখাবে।
5. বাম মেনু > **Authentication** > **Sign In / Providers** (বা Providers) > **Email**:
   - Email চালু রাখুন।
   - **Confirm email** বন্ধ করুন (টেস্টিং পর্যায়ে মোবাইল নম্বর দিয়ে লগইন হবে, ইমেইল নয়)।
   - Minimum password length: **8**।
6. বাম মেনু > **Project Settings** > **API** (বা Data API / API Keys):
   - **Project URL** কপি করুন।
   - **anon public** key কপি করুন।
   - ⚠️ **service_role** key কখনো কোথাও পেস্ট করবেন না, আমাকেও পাঠাবেন না।
7. প্রজেক্টের `src/config.js` ফাইল নোটপ্যাডে খুলে `PASTE_PROJECT_URL_HERE` ও `PASTE_ANON_PUBLIC_KEY_HERE` এর জায়গায় এই দুটো বসিয়ে সেভ করুন।

## খ. GitHub (কোড রাখার জায়গা)
1. https://github.com এ অ্যাকাউন্ট খুলুন।
2. উপরে **+** > **New repository**: নাম `travel-adda`, অবশ্যই **Private** বেছে নিন, তারপর **Create repository**।
3. **uploading an existing file** লিংকে চাপুন। জিপ খুলে ভেতরের সব ফাইল ও ফোল্ডার (`.github` ফোল্ডারসহ) টেনে এনে ছেড়ে দিন, তারপর **Commit changes**।
4. উপরের **Actions** ট্যাবে একটা চেক চলবে। সবুজ ✓ হলে ঠিক আছে। লাল ✗ হলে সেটার স্ক্রিনশট আমাকে পাঠান।

## গ. Expo (অ্যাপ বিল্ড)
1. https://expo.dev এ অ্যাকাউন্ট খুলুন।
2. **Create a project**: নাম `travel-adda`। তৈরি হলে যে **Project ID** দেখাবে, সেটা আমাকে পাঠান। আমি সেটা প্রজেক্টে বসিয়ে দেব, তারপর APK বিল্ডের ধাপ দেব।

## আমাকে যা পাঠাবেন
- GitHub Actions সবুজ না লাল (লাল হলে স্ক্রিনশট)
- Expo Project ID
- কোথাও আটকে গেলে সেই স্ক্রিনের স্ক্রিনশট

কখনো পাঠাবেন না: Database Password, service_role key, কোনো অ্যাকাউন্টের পাসওয়ার্ড।
