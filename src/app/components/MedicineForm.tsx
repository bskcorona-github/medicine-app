"use client";

import { useForm } from "react-hook-form";

type MedicineFormData = {
  medicineName: string;
  time: string;
  daily: boolean;
};

type MedicineFormProps = {
  onAddMedicine: (data: MedicineFormData) => void;
};

export default function MedicineForm({ onAddMedicine }: MedicineFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MedicineFormData>({
    defaultValues: {
      daily: true,
    },
  });

  const onSubmit = (data: MedicineFormData) => {
    onAddMedicine(data);
    reset({
      medicineName: "",
      time: "",
      daily: true,
    });
  };

  return (
    <div className="w-full max-w-md mx-auto bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4">お薬を追加</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label
            htmlFor="medicineName"
            className="block text-sm font-medium text-black mb-1"
          >
            お薬の名前
          </label>
          <input
            id="medicineName"
            type="text"
            {...register("medicineName", {
              required: "お薬の名前を入力してください",
            })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
            placeholder="例：血圧の薬"
          />
          {errors.medicineName && (
            <p className="mt-1 text-sm text-red-600">
              {errors.medicineName.message}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="time"
            className="block text-sm font-medium text-black mb-1"
          >
            飲む時間
          </label>
          <input
            id="time"
            type="time"
            {...register("time", { required: "時間を設定してください" })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
          />
          {errors.time && (
            <p className="mt-1 text-sm text-red-600">{errors.time.message}</p>
          )}
        </div>

        <div className="flex items-center">
          <input
            id="daily"
            type="checkbox"
            {...register("daily")}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label htmlFor="daily" className="ml-2 block text-sm text-black">
            毎日服用（ONにすると毎日同じ時間に通知されます）
          </label>
        </div>

        <button
          type="submit"
          className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
        >
          追加する
        </button>
      </form>
    </div>
  );
}
