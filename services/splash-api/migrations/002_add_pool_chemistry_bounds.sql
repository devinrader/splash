ALTER TABLE pool_settings
ADD COLUMN chemistry_bounds TEXT NOT NULL DEFAULT '{
  "free_chlorine": {
    "chemicalKey": "free_chlorine",
    "displayName": "Free Chlorine",
    "unit": "ppm",
    "minimum": 3,
    "target": 5,
    "maximum": 10,
    "enabled": true,
    "sortOrder": 10
  },
  "combined_chlorine": {
    "chemicalKey": "combined_chlorine",
    "displayName": "Combined Chlorine",
    "unit": "ppm",
    "minimum": 0,
    "target": 0,
    "maximum": 0.5,
    "enabled": true,
    "sortOrder": 20
  },
  "ph": {
    "chemicalKey": "ph",
    "displayName": "pH",
    "unit": null,
    "minimum": 7.2,
    "target": 7.6,
    "maximum": 7.8,
    "enabled": true,
    "sortOrder": 30
  },
  "total_alkalinity": {
    "chemicalKey": "total_alkalinity",
    "displayName": "Total Alkalinity",
    "unit": "ppm",
    "minimum": 60,
    "target": 80,
    "maximum": 100,
    "enabled": true,
    "sortOrder": 40
  },
  "cyanuric_acid": {
    "chemicalKey": "cyanuric_acid",
    "displayName": "Cyanuric Acid",
    "unit": "ppm",
    "minimum": 60,
    "target": 70,
    "maximum": 80,
    "enabled": true,
    "sortOrder": 50
  },
  "calcium_hardness": {
    "chemicalKey": "calcium_hardness",
    "displayName": "Calcium Hardness",
    "unit": "ppm",
    "minimum": 200,
    "target": 300,
    "maximum": 400,
    "enabled": true,
    "sortOrder": 60
  },
  "salt": {
    "chemicalKey": "salt",
    "displayName": "Salt",
    "unit": "ppm",
    "minimum": 3000,
    "target": 3400,
    "maximum": 4000,
    "enabled": true,
    "sortOrder": 70
  },
  "water_temperature": {
    "chemicalKey": "water_temperature",
    "displayName": "Water Temperature",
    "unit": "F",
    "minimum": 70,
    "target": 84,
    "maximum": 92,
    "enabled": true,
    "sortOrder": 80
  },
  "phosphates": {
    "chemicalKey": "phosphates",
    "displayName": "Phosphates",
    "unit": "ppb",
    "minimum": 0,
    "target": 0,
    "maximum": 200,
    "enabled": false,
    "sortOrder": 90
  },
  "borates": {
    "chemicalKey": "borates",
    "displayName": "Borates",
    "unit": "ppm",
    "minimum": 30,
    "target": 50,
    "maximum": 60,
    "enabled": false,
    "sortOrder": 100
  }
}';

UPDATE pool_settings
SET chemistry_bounds = '{
  "free_chlorine": {
    "chemicalKey": "free_chlorine",
    "displayName": "Free Chlorine",
    "unit": "ppm",
    "minimum": 3,
    "target": 5,
    "maximum": 10,
    "enabled": true,
    "sortOrder": 10
  },
  "combined_chlorine": {
    "chemicalKey": "combined_chlorine",
    "displayName": "Combined Chlorine",
    "unit": "ppm",
    "minimum": 0,
    "target": 0,
    "maximum": 0.5,
    "enabled": true,
    "sortOrder": 20
  },
  "ph": {
    "chemicalKey": "ph",
    "displayName": "pH",
    "unit": null,
    "minimum": 7.2,
    "target": 7.6,
    "maximum": 7.8,
    "enabled": true,
    "sortOrder": 30
  },
  "total_alkalinity": {
    "chemicalKey": "total_alkalinity",
    "displayName": "Total Alkalinity",
    "unit": "ppm",
    "minimum": 60,
    "target": 80,
    "maximum": 100,
    "enabled": true,
    "sortOrder": 40
  },
  "cyanuric_acid": {
    "chemicalKey": "cyanuric_acid",
    "displayName": "Cyanuric Acid",
    "unit": "ppm",
    "minimum": 60,
    "target": 70,
    "maximum": 80,
    "enabled": true,
    "sortOrder": 50
  },
  "calcium_hardness": {
    "chemicalKey": "calcium_hardness",
    "displayName": "Calcium Hardness",
    "unit": "ppm",
    "minimum": 200,
    "target": 300,
    "maximum": 400,
    "enabled": true,
    "sortOrder": 60
  },
  "salt": {
    "chemicalKey": "salt",
    "displayName": "Salt",
    "unit": "ppm",
    "minimum": 3000,
    "target": 3400,
    "maximum": 4000,
    "enabled": true,
    "sortOrder": 70
  },
  "water_temperature": {
    "chemicalKey": "water_temperature",
    "displayName": "Water Temperature",
    "unit": "F",
    "minimum": 70,
    "target": 84,
    "maximum": 92,
    "enabled": true,
    "sortOrder": 80
  },
  "phosphates": {
    "chemicalKey": "phosphates",
    "displayName": "Phosphates",
    "unit": "ppb",
    "minimum": 0,
    "target": 0,
    "maximum": 200,
    "enabled": false,
    "sortOrder": 90
  },
  "borates": {
    "chemicalKey": "borates",
    "displayName": "Borates",
    "unit": "ppm",
    "minimum": 30,
    "target": 50,
    "maximum": 60,
    "enabled": false,
    "sortOrder": 100
  }
}',
updated_at = CURRENT_TIMESTAMP
WHERE chemistry_bounds IS NULL OR chemistry_bounds = '{}';
