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
  onDeleteMedicine: (id: string) => void;
  onEditMedicine: (medicine: Medicine) => void;
  onDeleteAllMedicines: () => void;
};

export default function MedicineList({
  medicines,
  onTakeMedicine,
  onDeleteMedicine,
  onEditMedicine,
  onDeleteAllMedicines,
}: MedicineListProps) {
  return (
    <div className="w-full max-w-md mx-auto mt-8">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">お薬リスト</h2>
        {medicines.length > 0 && (
          <button
            onClick={onDeleteAllMedicines}
            className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
          >
            すべて削除
          </button>
        )}
      </div>

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
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-medium text-black">{medicine.name}</h3>
                  <p className="text-sm text-black">
                    {medicine.time}
                    {medicine.daily && " (毎日)"}
                  </p>
                </div>
                <div className="flex flex-col space-y-2">
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
                  <div className="flex space-x-2 mt-2">
                    <button
                      onClick={() => onEditMedicine(medicine)}
                      className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
                    >
                      編集
                    </button>
                    <button
                      onClick={() => onDeleteMedicine(medicine.id)}
                      className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                    >
                      削除
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
