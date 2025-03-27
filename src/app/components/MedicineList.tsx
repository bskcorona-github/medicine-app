"use client";

export type Medicine = {
  id: string;
  name: string;
  time: string;
  taken: boolean;
  daily: boolean;
};

type MedicineListProps = {
  medicines: Medicine[];
  onTakeMedicine: (id: string) => void;
};

export default function MedicineList({
  medicines,
  onTakeMedicine,
}: MedicineListProps) {
  return (
    <div className="w-full max-w-md mx-auto mt-8">
      <h2 className="text-xl font-bold mb-4">お薬リスト</h2>
      {medicines.length === 0 ? (
        <p className="text-black text-center">薬が登録されていません</p>
      ) : (
        <ul className="space-y-3">
          {medicines.map((medicine) => (
            <li
              key={medicine.id}
              className={`p-4 rounded-lg shadow ${
                medicine.taken ? "bg-green-50" : "bg-white"
              }`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-medium text-black">{medicine.name}</h3>
                  <p className="text-sm text-black">
                    {medicine.time}
                    {medicine.daily && " (毎日)"}
                  </p>
                </div>
                {medicine.taken ? (
                  <span className="px-3 py-1 text-sm text-green-800 bg-green-100 rounded-full">
                    服用済み
                  </span>
                ) : (
                  <button
                    onClick={() => onTakeMedicine(medicine.id)}
                    className="px-3 py-1 text-sm bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors"
                  >
                    服用する
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
