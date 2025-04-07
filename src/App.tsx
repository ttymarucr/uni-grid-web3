import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import ManagePositions from "./ManagePositions";
import { AppKitProvider } from "./components/AppkitProvider";
import Layout from "./components/Layout";
import GridManager from "./GridManager";

function App() {
  return (
    <AppKitProvider>
      <Layout>
        <Router>
          <Routes>
            <Route
              path="/manage/:contractAddress"
              element={<ManagePositions />}
            />
            <Route path="/" element={<GridManager />} />
          </Routes>
        </Router>
      </Layout>
    </AppKitProvider>
  );
}

export default App;
