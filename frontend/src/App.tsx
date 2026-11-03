import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { AlertsPage } from "./pages/AlertsPage";
import { TwinPage } from "./pages/TwinPage";
import { SandboxPage } from "./pages/SandboxPage";

export function App() {
  const [selectedPlant, setSelectedPlant] = useState<string>("solar_plant_1");

  return (
    <BrowserRouter>
      <Layout selectedPlant={selectedPlant} onSelectPlant={setSelectedPlant}>
        <Routes>
          <Route path="/" element={<Dashboard plantId={selectedPlant} />} />
          <Route path="/alerts" element={<AlertsPage plantId={selectedPlant} />} />
          <Route path="/twin" element={<TwinPage plantId={selectedPlant} />} />
          <Route path="/sandbox" element={<SandboxPage plantId={selectedPlant} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
