// Places offered when GPS is not used. Coordinates are city centres (prayer times change about 1 minute per ~25 km).
export const CITIES = [
  { id: 'makkah', group: 'sa', name: 'মক্কা', near: 'মক্কার কাছে', lat: 21.4225, lng: 39.8262 },
  { id: 'madinah', group: 'sa', name: 'মদিনা', near: 'মদিনার কাছে', lat: 24.4672, lng: 39.6111 },
  { id: 'mina', group: 'sa', name: 'মিনা', near: 'মিনার কাছে', lat: 21.4133, lng: 39.8933 },
  { id: 'arafah', group: 'sa', name: 'আরাফা', near: 'আরাফার কাছে', lat: 21.3549, lng: 39.9842 },
  { id: 'jeddah', group: 'sa', name: 'জেদ্দা', near: 'জেদ্দার কাছে', lat: 21.5433, lng: 39.1728 },
  { id: 'taif', group: 'sa', name: 'তায়েফ', near: 'তায়েফের কাছে', lat: 21.2703, lng: 40.4158 },
  { id: 'riyadh', group: 'sa', name: 'রিয়াদ', near: 'রিয়াদের কাছে', lat: 24.7136, lng: 46.6753 },
  { id: 'dammam', group: 'sa', name: 'দাম্মাম', near: 'দাম্মামের কাছে', lat: 26.4207, lng: 50.0888 },
  { id: 'dhaka', group: 'bd', name: 'ঢাকা', near: 'ঢাকার কাছে', lat: 23.8103, lng: 90.4125 },
  { id: 'chattogram', group: 'bd', name: 'চট্টগ্রাম', near: 'চট্টগ্রামের কাছে', lat: 22.3569, lng: 91.7832 },
  { id: 'sylhet', group: 'bd', name: 'সিলেট', near: 'সিলেটের কাছে', lat: 24.8949, lng: 91.8687 },
  { id: 'rajshahi', group: 'bd', name: 'রাজশাহী', near: 'রাজশাহীর কাছে', lat: 24.3745, lng: 88.6042 },
  { id: 'khulna', group: 'bd', name: 'খুলনা', near: 'খুলনার কাছে', lat: 22.8456, lng: 89.5403 },
  { id: 'barishal', group: 'bd', name: 'বরিশাল', near: 'বরিশালের কাছে', lat: 22.701, lng: 90.3535 },
  { id: 'rangpur', group: 'bd', name: 'রংপুর', near: 'রংপুরের কাছে', lat: 25.7439, lng: 89.2752 },
  { id: 'mymensingh', group: 'bd', name: 'ময়মনসিংহ', near: 'ময়মনসিংহের কাছে', lat: 24.7471, lng: 90.4203 },
  { id: 'cumilla', group: 'bd', name: 'কুমিল্লা', near: 'কুমিল্লার কাছে', lat: 23.4607, lng: 91.1809 },
];
export const CITY_GROUPS = [
  { id: 'sa', title: 'সৌদি আরব' },
  { id: 'bd', title: 'বাংলাদেশ' },
];
