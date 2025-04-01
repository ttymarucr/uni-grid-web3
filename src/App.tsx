import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import ManagePositions from './ManagePositions';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/manage/:contractAddress" element={<ManagePositions />} />
      </Routes>
    </Router>
  );
}

export default App;
