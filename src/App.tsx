import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import ManagePositions from "./pages/ManagePositions";
import { AppKitProvider } from "./components/AppkitProvider";
import Layout from "./components/Layout";
import GridManager from "./pages/GridManager";
import { SubGraphProvider } from "./components/SubGraphProvider";


function App() {
  return (
    <AppKitProvider>
      <SubGraphProvider>
        <Layout>
          <Router basename="/uni-grid-web3/">
            <Routes>
              <Route
                path="/manage/:contractAddress"
                element={<ManagePositions />}
              />
              <Route path="/" element={<GridManager />} />
            </Routes>
          </Router>
        </Layout>
      </SubGraphProvider>
    </AppKitProvider>
  );
}

export default App;
