import { useEffect, useState } from 'react';
import * as FileSystem from 'expo-file-system';
import { Asset } from 'expo-asset';
import Papa from 'papaparse';

interface MedicineEntry {
  medicine_name: string;
  splimprint: string;
  dosage_form: string;
  spl_ingredients: string;
}

const useMedicineData = () => {
  const [medicines, setMedicines] = useState<string[][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCSVFromAssets = async (module: number): Promise<string> => {
    const asset = Asset.fromModule(module);
    await asset.downloadAsync();

    if (!asset.localUri) {
      throw new Error('Could not load asset URI');
    }

    return FileSystem.readAsStringAsync(asset.localUri);
  };

  useEffect(() => {
    const loadCSVData = async () => {
      try {
        const csvContent = await loadCSVFromAssets(require('../assets/medicines.csv'));

        const parsed = Papa.parse(csvContent.trim(), {
          header: false,
          skipEmptyLines: true,
        });

        if (parsed.errors.length > 0) {
          console.warn('CSV Parse Errors:', parsed.errors);
        }

        const data = parsed.data as string[][];
        setMedicines(data);
      } catch (err) {
        console.error('CSV load error:', err);
        setError(`Failed to load medicine data: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
    };

    loadCSVData();
  }, []);

  const searchMedicine = (imprint: string): MedicineEntry | null => {
    if (!imprint || loading || medicines.length === 0) return null;

    const IMPRINT_COLUMN = 13;      // pillbox_imprint
    const NAME_COLUMN = 32;         // medicine_name
    const DOSAGE_COLUMN = 37;       // dosage_form
    const INGREDIENTS_COLUMN = 20;  // spl_ingredients

    const target = imprint.trim().toLowerCase();

    for (let i = 1; i < medicines.length; i++) {
      const row = medicines[i];
      const imprintCell = row[IMPRINT_COLUMN]?.trim().toLowerCase();

      if (imprintCell?.includes(target)) {
        const name = row[NAME_COLUMN]?.trim() || 'Unknown';
        const dosage_form = row[DOSAGE_COLUMN]?.trim() || 'Unknown';
        const ingredients = row[INGREDIENTS_COLUMN]?.trim() || 'Unknown';

        console.log(`Match found at row ${i}: ${name}, ${imprintCell}`);

        return {
          medicine_name: name,
          splimprint: imprint,
          dosage_form,
          spl_ingredients: ingredients,
        };
      }
    }

    console.log(`No match found for imprint "${imprint}"`);
    return null;
  };

  return { searchMedicine, loading, error };
};

export default useMedicineData;
