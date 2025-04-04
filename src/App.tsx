import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import ManagePositions from "./ManagePositions";
import { AppKitProvider } from "./components/AppkitProvider";

function App() {
  return (
    <AppKitProvider>
      <Router>
        <Routes>
          <Route
            path="/manage/:contractAddress"
            element={<ManagePositions />}
          />
        </Routes>
      </Router>
    </AppKitProvider>
  );
}

export default App;
