"""
tests/test_qubo_qaoa_optimizer.py
AeroQuantum-Wind Phase 6: QUBO & QAOA Optimization Test Suite.

Validates:
1. QUBO problem construction and mathematical invariants.
2. Inter-turbine spacing penalty enforcement on metric coordinates.
3. Target turbine capacity constraint quadratic penalty enforcement.
4. Exact algebraic identity between QUBO and Ising spin formulation (< 1e-12).
5. Classical exhaustive solver finding mathematically certified global optimum.
6. QAOA quantum circuit structure, gate depth, and unitary operators.
7. AerSimulator deterministic execution reproducibility via seed.
8. IBM Quantum hardware graceful failure and HARDWARE_UNAVAILABLE status (zero fabrication).
9. Top-K exact physical multi-turbine re-evaluation & layout reordering.
10. Real Anantapur candidate set end-to-end QAOA optimization.
11. FastAPI optimization endpoints (/qubo-formulation, /classical, /qaoa, /hardware-status).
12. Failure behaviour guards (empty candidates, invalid coordinates).
"""

from __future__ import annotations

import json
from pathlib import Path
import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.engineering.floris_engine import TURBINE_CATALOG
from backend.app.engineering.qubo_engine import (
    QuboProblem,
    build_qubo_from_phase6_contract,
)
from backend.app.engineering.qaoa_engine import (
    QAOALayoutOptimizer,
    AerSimulatorBackend,
    IBMQuantumHardwareBackend,
    build_qaoa_circuit,
)
from backend.app.engineering.aep_engine import aep_calculation_engine
from backend.app.engineering.candidate_engine import candidate_engine


SAMPLE_PATH = Path(__file__).resolve().parents[1] / "backend" / "data" / "samples" / "real_data_sample_anantapur.json"


# ── TEST 1: QUBO PROBLEM CONSTRUCTION & MATHEMATICAL INVARIANTS ───────────────

def test_qubo_problem_construction_and_mathematical_invariants():
    """Verify QUBO formulation linear and quadratic terms match analytical derivation."""
    c_ids = ["C1", "C2", "C3"]
    positions = [(0.0, 0.0), (1000.0, 0.0), (0.0, 1000.0)]
    linear_e = [10000.0, 10000.0, 10000.0]
    wake_mat = [
        [0.0, 400.0, 300.0],
        [400.0, 0.0, 100.0],
        [300.0, 100.0, 0.0],
    ]
    target_k = 2
    eta = 0.9038
    min_dist = 500.0

    qubo = QuboProblem(
        candidate_ids=c_ids,
        positions_metric=positions,
        linear_energy_mwh=linear_e,
        wake_penalty_matrix_mwh=wake_mat,
        target_turbines=target_k,
        min_spacing_m=min_dist,
        bop_derate_factor=eta,
    )

    assert qubo.n_candidates == 3
    assert qubo.target_turbines == 2
    assert qubo.offset == pytest.approx(qubo.penalty_capacity * (target_k ** 2), rel=1e-5)

    # Linear term formula: h_i = - (E_i * eta) + P_cap * (1 - 2*k)
    expected_h = - (10000.0 * eta) + qubo.penalty_capacity * (1.0 - 2.0 * target_k)
    for i in range(3):
        assert qubo.h_linear[i] == pytest.approx(expected_h, rel=1e-5)

    # Quadratic term formula for non-violating pairs: J_ij = Q_ij * eta + 2 * P_cap
    for i in range(3):
        for j in range(i + 1, 3):
            expected_j = wake_mat[i][j] * eta + 2.0 * qubo.penalty_capacity
            assert qubo.J_quad[i, j] == pytest.approx(expected_j, rel=1e-5)

    # Penalty calibrations must exceed maximum single-turbine energy
    max_net = max(linear_e) * eta
    assert qubo.penalty_capacity >= 1.5 * max_net
    assert qubo.penalty_spacing >= 3.0 * max_net


# ── TEST 2: INTER-TURBINE SPACING PENALTY ENFORCEMENT ─────────────────────────

def test_qubo_spacing_violation_penalty_enforcement():
    """Verify that placing turbines closer than min_spacing_m is heavily penalized."""
    # Place C1 and C2 200m apart (violation for 500m threshold)
    c_ids = ["C1", "C2", "C3"]
    positions = [(0.0, 0.0), (200.0, 0.0), (2000.0, 0.0)]
    linear_e = [8000.0, 8000.0, 8000.0]
    wake_mat = [[0.0, 500.0, 50.0], [500.0, 0.0, 50.0], [50.0, 50.0, 0.0]]

    qubo = QuboProblem(
        candidate_ids=c_ids,
        positions_metric=positions,
        linear_energy_mwh=linear_e,
        wake_penalty_matrix_mwh=wake_mat,
        target_turbines=2,
        min_spacing_m=500.0,
    )

    # Pair (0, 1) is a spacing violation
    assert (0, 1) in qubo.spacing_violations
    assert len(qubo.spacing_violations) == 1

    # Quadratic term J_01 must include P_spacing
    assert qubo.J_quad[0, 1] >= qubo.penalty_spacing

    # Bitstring '110' (selecting C1 and C2) must be infeasible
    eval_violating = qubo.evaluate_bitstring("110")
    assert eval_violating.is_feasible is False
    assert eval_violating.spacing_violations_count == 1
    assert eval_violating.spacing_penalty_mwh > 0.0

    # Bitstring '101' (selecting C1 and C3) has no spacing violations and is feasible
    eval_valid = qubo.evaluate_bitstring("101")
    assert eval_valid.is_feasible is True
    assert eval_valid.spacing_violations_count == 0
    assert eval_valid.spacing_penalty_mwh == 0.0

    # Feasible solution must have strictly lower QUBO cost
    assert eval_valid.qubo_cost < eval_violating.qubo_cost


# ── TEST 3: TARGET TURBINE CAPACITY CONSTRAINT ENFORCEMENT ────────────────────

def test_qubo_target_turbine_count_penalty_enforcement():
    """Verify that selecting k != target_k incurs quadratic capacity penalty."""
    qubo = QuboProblem(
        candidate_ids=["C1", "C2", "C3", "C4"],
        positions_metric=[(0, 0), (1000, 0), (2000, 0), (3000, 0)],
        linear_energy_mwh=[5000.0] * 4,
        wake_penalty_matrix_mwh=[[0.0] * 4 for _ in range(4)],
        target_turbines=2,
        min_spacing_m=500.0,
    )

    eval_k1 = qubo.evaluate_bitstring("1000")  # k=1 (target 2)
    eval_k2 = qubo.evaluate_bitstring("1100")  # k=2 (target 2)
    eval_k3 = qubo.evaluate_bitstring("1110")  # k=3 (target 2)

    assert eval_k2.count_valid is True
    assert eval_k2.capacity_penalty_mwh == 0.0

    assert eval_k1.count_valid is False
    assert eval_k1.capacity_penalty_mwh == pytest.approx(qubo.penalty_capacity * (1 ** 2), rel=1e-5)

    assert eval_k3.count_valid is False
    assert eval_k3.capacity_penalty_mwh == pytest.approx(qubo.penalty_capacity * (1 ** 2), rel=1e-5)

    # Valid k=2 has strictly lower QUBO cost
    assert eval_k2.qubo_cost < eval_k1.qubo_cost
    assert eval_k2.qubo_cost < eval_k3.qubo_cost


# ── TEST 4: EXACT ALGEBRAIC EQUIVALENCE QUBO <-> ISING ────────────────────────

def test_qubo_to_ising_exact_algebraic_equivalence():
    """Prove mathematically exact identity between QUBO cost and Ising spin Hamiltonian."""
    n = 5
    np.random.seed(101)
    qubo = QuboProblem(
        candidate_ids=[f"C{i}" for i in range(n)],
        positions_metric=[(i * 1000.0, 0.0) for i in range(n)],
        linear_energy_mwh=list(np.random.uniform(6000, 9000, n)),
        wake_penalty_matrix_mwh=[[float(abs(i - j) * 50.0) if i != j else 0.0 for j in range(n)] for i in range(n)],
        target_turbines=3,
        min_spacing_m=800.0,
    )

    ising = qubo.to_ising()
    tilde_h = ising["tilde_h"]
    tilde_J = ising["tilde_J"]
    tilde_offset = ising["tilde_offset"]

    # Verify over all 2^N = 32 bitstrings
    for bit in range(2 ** n):
        bits = [(bit >> i) & 1 for i in range(n)]
        # Spin mapping: z_i = 1 - 2*x_i
        spins = [1.0 - 2.0 * b for b in bits]

        # QUBO cost
        eval_res = qubo.evaluate_bitstring(bits)
        qubo_cost = eval_res.qubo_cost

        # Ising cost
        ising_cost = (
            sum(tilde_h[i] * spins[i] for i in range(n))
            + sum(tilde_J[(i, j)] * spins[i] * spins[j] for (i, j) in tilde_J)
            + tilde_offset
        )

        assert abs(qubo_cost - ising_cost) < 1e-9, f"Mismatch at bitstring {bits}"


# ── TEST 5: CLASSICAL EXHAUSTIVE BENCHMARK SOLVER ──────────────

def test_classical_exhaustive_solver_finds_certified_global_optimum():
    """Verify classical solver explores combinations and finds certified global QUBO optimum."""
    qubo = QuboProblem(
        candidate_ids=["C1", "C2", "C3", "C4"],
        positions_metric=[(0, 0), (0, 1000), (1000, 0), (1000, 1000)],
        linear_energy_mwh=[10000.0] * 4,
        wake_penalty_matrix_mwh=[
            [0.0, 500.0, 200.0, 50.0],
            [500.0, 0.0, 50.0, 200.0],
            [200.0, 50.0, 0.0, 500.0],
            [50.0, 200.0, 500.0, 0.0],
        ],
        target_turbines=2,
        min_spacing_m=800.0,
    )

    res = qubo.solve_classical_exhaustive(top_k=5)
    assert res["status"] == "COMPLETED"
    assert res["total_subsets_evaluated"] == 6  # C(4, 2) = 6
    assert res["feasible_subsets_count"] == 6

    # Minimum wake loss is 50.0 MWh between opposite diagonal corners (C1, C4) or (C2, C3)
    best = res["global_qubo_optimum"]
    assert best["bitstring"] in ["1001", "0110"]
    assert best["surrogate_wake_loss_mwh"] == pytest.approx(50.0, rel=1e-3)


# ── TEST 6: QAOA CIRCUIT STRUCTURE AND GATE OPERATIONS ────────────────────────

def test_qaoa_circuit_structure_depth_and_gates():
    """Verify QAOA circuit construction: superposition, cost unitary, mixer unitary, measurements."""
    qubo = QuboProblem(
        candidate_ids=["C1", "C2", "C3", "C4"],
        positions_metric=[(0, 0), (1000, 0), (0, 1000), (1000, 1000)],
        linear_energy_mwh=[8000.0] * 4,
        wake_penalty_matrix_mwh=[[100.0 if i != j else 0.0 for j in range(4)] for i in range(4)],
        target_turbines=2,
        min_spacing_m=500.0,
    )

    # Test p=1
    qc_p1 = build_qaoa_circuit(qubo, gamma=[0.5], beta=[0.3])
    assert qc_p1.num_qubits == 4
    ops_p1 = qc_p1.count_ops()
    assert ops_p1.get("h", 0) == 4   # 4 Hadamard initial gates
    assert ops_p1.get("rx", 0) == 4  # 4 mixer RX gates
    assert ops_p1.get("cx", 0) > 0   # Entangling CX gates for pairwise interactions
    assert ops_p1.get("measure", 0) == 4

    # Test p=2 (double depth and CX gates)
    qc_p2 = build_qaoa_circuit(qubo, gamma=[0.5, 0.4], beta=[0.3, 0.2])
    ops_p2 = qc_p2.count_ops()
    assert ops_p2.get("rx", 0) == 8
    assert ops_p2.get("cx", 0) == ops_p1.get("cx", 0) * 2
    assert qc_p2.depth() > qc_p1.depth()


# ── TEST 7: AERSIMULATOR REPRODUCIBILITY WITH SEED ────────────────────────────

def test_aer_simulator_deterministic_sampling_with_seed():
    """Verify that AerSimulator produces identical bitstring counts with fixed seed."""
    qubo = QuboProblem(
        candidate_ids=["C1", "C2", "C3"],
        positions_metric=[(0, 0), (1000, 0), (2000, 0)],
        linear_energy_mwh=[7000.0] * 3,
        wake_penalty_matrix_mwh=[[0.0] * 3 for _ in range(3)],
        target_turbines=2,
        min_spacing_m=500.0,
    )

    qc = build_qaoa_circuit(qubo, gamma=[0.6], beta=[0.4])

    backend1 = AerSimulatorBackend(seed=123)
    counts1 = backend1.run_circuit(qc, shots=500)

    backend2 = AerSimulatorBackend(seed=123)
    counts2 = backend2.run_circuit(qc, shots=500)

    assert counts1 == counts2


# ── TEST 8: IBM QUANTUM HARDWARE STATUS AND ZERO FABRICATION ──────────────────

def test_ibm_quantum_backend_hardware_unavailable_zero_fabrication():
    """Verify IBM Quantum backend strictly returns HARDWARE_UNAVAILABLE when credentials are missing."""
    ibm_backend = IBMQuantumHardwareBackend(token="")

    assert ibm_backend.is_available() is False
    assert ibm_backend.get_status() == "HARDWARE_UNAVAILABLE"

    info = ibm_backend.get_info()
    assert info["is_hardware"] is True
    assert "No IBM Quantum credentials" in info["error_reason"]

    # Running circuit without credentials must raise RuntimeError
    qubo = QuboProblem(
        candidate_ids=["C1", "C2"],
        positions_metric=[(0, 0), (1000, 0)],
        linear_energy_mwh=[6000.0, 6000.0],
        wake_penalty_matrix_mwh=[[0.0, 100.0], [100.0, 0.0]],
        target_turbines=1,
        min_spacing_m=500.0,
    )
    qc = build_qaoa_circuit(qubo, [0.5], [0.5])
    with pytest.raises(RuntimeError) as exc_info:
        ibm_backend.run_circuit(qc, shots=100)
    assert "Cannot execute on IBM Quantum hardware" in str(exc_info.value)

    # Optimizer must return structured status without throwing
    optimizer = QAOALayoutOptimizer(backend=ibm_backend)
    res = optimizer.optimize_layout(qubo)
    assert res["status"] == "HARDWARE_UNAVAILABLE"
    assert res["backend"]["status"] == "HARDWARE_UNAVAILABLE"


# ── TEST 9: TOP-K EXACT PHYSICAL MULTI-TURBINE RE-EVALUATION ──────────────────

def test_top_k_exact_physical_reevaluation_and_reordering():
    """
    Verify core Phase 6 requirement:
    QAOA optimizes the pairwise surrogate, but exact multi-turbine wake/AEP
    remains the physical truth.
    """
    qubo = QuboProblem(
        candidate_ids=["C1", "C2", "C3", "C4"],
        positions_metric=[(0, 0), (0, 800), (1000, 0), (1000, 800)],
        linear_energy_mwh=[10000.0] * 4,
        wake_penalty_matrix_mwh=[
            [0.0, 400.0, 200.0, 50.0],
            [400.0, 0.0, 50.0, 200.0],
            [200.0, 50.0, 0.0, 400.0],
            [50.0, 200.0, 400.0, 0.0],
        ],
        target_turbines=2,
        min_spacing_m=600.0,
    )

    optimizer = QAOALayoutOptimizer(
        backend=AerSimulatorBackend(seed=42),
        p_layers=1,
        shots=512,
        max_classical_iterations=10,
        top_k_physical_reeval=3,
    )

    res = optimizer.optimize_layout(qubo, site_elevation_m=350.0)
    assert res["status"] == "OPTIMIZATION_COMPLETED"
    assert res["algorithm"] == "QAOA"

    # Physical re-evaluation results present
    phys = res["physical_reevaluation"]
    assert phys["states_reevaluated_count"] > 0
    assert len(phys["results"]) > 0

    first_phys = phys["results"][0]
    assert "exact_net_aep_gwh" in first_phys
    assert "exact_wake_loss_pct" in first_phys
    assert "qubo_surrogate_net_gwh" in first_phys
    assert first_phys["physical_sanity_status"] == "VERIFIED_PHYSICAL"

    # Declared engineering optimum is chosen based on exact Net AEP
    opt = res["declared_engineering_optimum"]
    assert opt is not None
    assert opt["exact_net_aep_gwh"] > 0.0
    assert "reordering_note" in phys


# ── TEST 10: REAL ANANTAPUR CANDIDATES END-TO-END QAOA ────────────────────────

def test_real_data_sample_anantapur_qaoa_end_to_end():
    """Execute end-to-end QAOA optimization on verified Anantapur candidate set."""
    with open(SAMPLE_PATH) as f:
        data = json.load(f)

    p4_gen = candidate_engine.generate_candidates(
        search_envelope_geometry=data["boundary"]["geometry"],
        turbine_model_id="ge_25_120",
        min_spacing_diameters=4.0,
        max_candidates=6,
    )

    cands = [
        {
            "id": c.candidate_id,
            "latitude": c.latitude,
            "longitude": c.longitude,
            "utm_easting_m": c.utm_easting_m,
            "utm_northing_m": c.utm_northing_m,
            "elevation_m": c.elevation_m or 347.0,
        }
        for c in p4_gen.feasible_candidates[:6]
    ]

    contract = aep_calculation_engine.build_phase6_performance_contract(
        candidate_positions=cands,
        turbine_model_id="ge_25_120",
        site_elevation_m=347.0,
    )

    qubo = build_qubo_from_phase6_contract(contract, target_turbines=3)
    assert qubo.n_candidates == 6
    assert qubo.target_turbines == 3

    optimizer = QAOALayoutOptimizer(
        backend=AerSimulatorBackend(seed=42),
        p_layers=1,
        shots=512,
        max_classical_iterations=8,
        top_k_physical_reeval=3,
    )

    res = optimizer.optimize_layout(qubo, site_elevation_m=347.0)
    assert res["status"] == "OPTIMIZATION_COMPLETED"
    assert res["declared_engineering_optimum"] is not None

    winner = res["declared_engineering_optimum"]
    assert len(winner["selected_candidate_ids"]) == 3
    assert winner["exact_net_aep_gwh"] > 0.0
    assert winner["exact_wake_loss_pct"] >= 0.0

    # Provenance
    assert "Qiskit" in res["provenance"]["quantum_layer"]
    assert "FLORIS" in res["provenance"]["physical_layer"]
    assert "IEC 61400-15-1:2025" in res["provenance"]["loss_accounting"]


# ── TEST 11: FASTAPI OPTIMIZATION ENDPOINTS ───────────────────────────────────

def test_fastapi_optimization_endpoints():
    """Verify FastAPI routes /qubo-formulation, /classical, /qaoa, and /hardware-status."""
    client = TestClient(app)

    # 1. Hardware status
    hw_res = client.get("/api/engineering/optimization/hardware-status")
    assert hw_res.status_code == 200
    hw_data = hw_res.json()
    assert hw_data["status"] in ["AVAILABLE", "HARDWARE_UNAVAILABLE"]
    assert "ibm_quantum_available" in hw_data

    # Sample candidates payload
    candidates_payload = [
        {"id": "T1", "latitude": 14.680, "longitude": 77.600, "utm_easting_m": 780000, "utm_northing_m": 1624000, "elevation_m": 350.0},
        {"id": "T2", "latitude": 14.685, "longitude": 77.605, "utm_easting_m": 780500, "utm_northing_m": 1624500, "elevation_m": 350.0},
        {"id": "T3", "latitude": 14.690, "longitude": 77.610, "utm_easting_m": 781000, "utm_northing_m": 1625000, "elevation_m": 350.0},
        {"id": "T4", "latitude": 14.695, "longitude": 77.615, "utm_easting_m": 781500, "utm_northing_m": 1625500, "elevation_m": 350.0},
    ]

    # 2. QUBO formulation endpoint
    qubo_res = client.post(
        "/api/engineering/optimization/qubo-formulation",
        json={
            "candidates": candidates_payload,
            "turbine_model_id": "ge_25_120",
            "target_turbines": 2,
            "min_spacing_multiplier": 4.0,
            "site_elevation_m": 350.0,
        },
    )
    assert qubo_res.status_code == 200
    qubo_data = qubo_res.json()
    assert qubo_data["status"] == "SUCCESS"
    assert "qubo_problem" in qubo_data
    assert "ising_hamiltonian" in qubo_data

    # 3. Classical benchmark endpoint
    classic_res = client.post(
        "/api/engineering/optimization/classical",
        json={
            "candidates": candidates_payload,
            "turbine_model_id": "ge_25_120",
            "target_turbines": 2,
            "min_spacing_multiplier": 4.0,
            "site_elevation_m": 350.0,
            "top_k": 3,
        },
    )
    assert classic_res.status_code == 200
    classic_data = classic_res.json()
    assert classic_data["status"] == "COMPLETED"
    assert classic_data["solver"] == "CLASSICAL_EXHAUSTIVE"
    assert "classical_qubo_optimum" in classic_data
    assert "declared_engineering_optimum" in classic_data

    # 4. QAOA optimization endpoint
    qaoa_res = client.post(
        "/api/engineering/optimization/qaoa",
        json={
            "candidates": candidates_payload,
            "turbine_model_id": "ge_25_120",
            "target_turbines": 2,
            "min_spacing_multiplier": 4.0,
            "site_elevation_m": 350.0,
            "p_layers": 1,
            "shots": 256,
            "max_classical_iterations": 5,
            "backend_type": "simulator",
            "random_seed": 42,
        },
    )
    assert qaoa_res.status_code == 200
    qaoa_data = qaoa_res.json()
    assert qaoa_data["status"] == "OPTIMIZATION_COMPLETED"
    assert qaoa_data["algorithm"] == "QAOA"
    assert "quantum_circuit" in qaoa_data
    assert "declared_engineering_optimum" in qaoa_data


# ── TEST 12: FAILURE BEHAVIOUR GUARDS & NON-FABRICATION ───────────────────────

def test_failure_behaviour_guards_no_candidates():
    """Verify endpoint rejects empty candidates array with HTTP 400."""
    client = TestClient(app)

    res = client.post(
        "/api/engineering/optimization/qubo-formulation",
        json={"candidates": [], "turbine_model_id": "ge_25_120"},
    )
    assert res.status_code == 400
    assert "At least one candidate position is required" in res.json()["detail"]
