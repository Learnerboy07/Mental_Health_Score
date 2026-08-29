from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Literal

import pandas as pd
import joblib
import os


app = FastAPI(
    title="Student Mental Health Prediction API",
    description="Predict Mental Health Score using Machine Learning",
    version="1.0.0"
)


# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"]
)

# Model path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

MODEL_PATH = os.path.join(
    BASE_DIR,
    "mental_health_model.pkl"
)


# Load model
if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(
        f"Model file not found: {MODEL_PATH}"
    )

model = joblib.load(MODEL_PATH)


# Pydantic input model
class StudentData(BaseModel):

    Age: int = Field(..., ge=1, le=100)

    Gender: Literal[
        "Male",
        "Female"
    ]

    Country: str

    Academic_Level: Literal[
        "Undergraduate",
        "Graduate",
        "High School"
    ]

    Most_Used_Platform: Literal[
        "Facebook",
        "LinkedIn",
        "Instagram",
        "Snapchat",
        "Twitter",
        "YouTube",
        "TikTok",
        "LINE",
        "KakaoTalk",
        "VKontakte",
        "WhatsApp",
        "WeChat"
    ]

    Purpose_Of_Use: Literal[
        "Networking",
        "Education",
        "Entertainment",
        "News"
    ]

    Avg_Daily_Usage_Hours: float = Field(..., ge=0)

    Daily_Unlocks: int = Field(..., ge=0)

    Study_Hours: float = Field(..., ge=0)

    Physical_Activity_Hours: float = Field(..., ge=0)

    Sleep_Hours_Per_Night: float = Field(
        ...,
        ge=0,
        le=24
    )

    Stress_Level: Literal[
        "Low",
        "Medium",
        "High",
        "Very High"
    ]


# Response model
class PredictionResponse(BaseModel):

    predicted_mental_health_score: float


# Top countries
TOP_COUNTRIES = [
    "India",
    "USA",
    "Canada",
    "Australia",
    "UK",
    "Germany",
    "Mexico",
    "Turkey",
    "France"
]


# Home endpoint
@app.get("/")
def home():

    return {
        "message": "Welcome to Ujjwal World",
        "status": "API is running",
        "docs": "/docs"
    }


# Health endpoint
@app.get("/health")
def health():

    return {
        "status": "healthy",
        "model": "loaded"
    }


# Prediction endpoint
@app.post(
    "/predict",
    response_model=PredictionResponse
)
def predict(data: StudentData):

    try:

        # Country grouping
        if data.Country in TOP_COUNTRIES:
            country_group = data.Country
        else:
            country_group = "Other"


        # Create DataFrame
        input_row = pd.DataFrame([
            {
                "Age": data.Age,
                "Gender": data.Gender,
                "Country": data.Country,
                "Academic_Level": data.Academic_Level,
                "Most_Used_Platform": data.Most_Used_Platform,
                "Purpose_Of_Use": data.Purpose_Of_Use,
                "Avg_Daily_Usage_Hours": data.Avg_Daily_Usage_Hours,
                "Daily_Unlocks": data.Daily_Unlocks,
                "Study_Hours": data.Study_Hours,
                "Physical_Activity_Hours": data.Physical_Activity_Hours,
                "Sleep_Hours_Per_Night": data.Sleep_Hours_Per_Night,
                "Stress_Level": data.Stress_Level,
                "grouped_country": country_group
            }
        ])


        # Prediction
        prediction = model.predict(input_row)[0]


        # Response
        return PredictionResponse(
            predicted_mental_health_score=round(
                float(prediction),
                2
            )
        )


    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# Run server
if __name__ == "__main__":

    import uvicorn

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000
    )