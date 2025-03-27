"use client";

import { useForm } from "react-hook-form";
import { useEffect } from "react";
import { Medicine } from "./MedicineList";

export type MedicineFormData = {
  medicineName: string;
  time: string;
  daily: boolean;
};

type MedicineFormProps = {
  onAddMedicine: (data: MedicineFormData) => void;
  onUpdateMedicine?: (id: string, data: MedicineFormData) => void;
  editingMedicine: Medicine | null;
  onCancelEdit?: () => void;
};

export default function MedicineForm({
  onAddMedicine,
  onUpdateMedicine,
  editingMedicine,
  onCancelEdit,
}: MedicineFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<MedicineFormData>({
    defaultValues: {
      medicineName: "",
      time: "",
      daily: true,
    },
  });

  // 編集モードの場合、フォームに値をセット
  useEffect(() => {
    if (editingMedicine) {
      setValue("medicineName", editingMedicine.name);
      setValue("time", editingMedicine.time);
      setValue("daily", editingMedicine.daily);
    } else {
      reset({
        medicineName: "",
        time: "",
        daily: true,
      });
    }
  }, [editingMedicine, setValue, reset]);

  const onSubmit = (data: MedicineFormData) => {
    if (editingMedicine && onUpdateMedicine) {
      onUpdateMedicine(editingMedicine.id, data);
    } else {
      onAddMedicine(data);
    }

    reset({
      medicineName: "",
      time: "",
      daily: true,
    });
  };

  return (
    <div className="w-full max-w-md mx-auto bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4">
        {editingMedicine ? "お薬を編集" : "お薬を追加"}
      </h2>
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

        <div className="flex space-x-2">
          <button
            type="submit"
            className="flex-1 bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            {editingMedicine ? "更新する" : "追加する"}
          </button>

          {editingMedicine && onCancelEdit && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
            >
              キャンセル
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
