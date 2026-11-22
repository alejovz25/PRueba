import os
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim

os.makedirs("models", exist_ok=True)
torch.manual_seed(42)
np.random.seed(42)

PRODUCTOS_CULTIVO = {
    "maiz": 1.0,
    "yuca": 0.8,
    "ñame": 0.9,
    "platano": 1.25,
}

PRODUCTOS_ANIMAL = {
    "gallinas": 0.7,
    "pollos": 0.85,
    "cerdo": 1.0,
    "vaca": 1.2,
    "reses": 1.25,
}


class CultivoNN(nn.Module):
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(5, 16),
            nn.ReLU(),
            nn.Linear(16, 8),
            nn.ReLU(),
            nn.Linear(8, 1),
            nn.Sigmoid(),
        )

    def forward(self, x):
        return self.net(x)


class AnimalNN(nn.Module):
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(4, 16),
            nn.ReLU(),
            nn.Linear(16, 8),
            nn.ReLU(),
            nn.Linear(8, 1),
            nn.Sigmoid(),
        )

    def forward(self, x):
        return self.net(x)


def entrenar():
    n = 600
    # Cultivos: [temp, radiacion, humedad, area_ha, factor_cultivo]
    temp = np.random.uniform(16, 38, (n, 1))
    rad = np.random.uniform(150, 1050, (n, 1))
    hum = np.random.uniform(35, 95, (n, 1))
    area_ha = np.random.uniform(0.05, 25.0, (n, 1))
    fact_c = np.random.choice(list(PRODUCTOS_CULTIVO.values()), (n, 1))

    Xc = np.hstack([temp / 40.0, rad / 1100.0, hum / 100.0, np.log1p(area_ha) / 3.5, fact_c / 1.5])
    yc = np.clip(
        (temp / 40.0) * 0.35
        + (rad / 1100.0) * 0.30
        + (1.0 - hum / 100.0) * 0.20
        + (fact_c / 1.5) * 0.15,
        0.0,
        1.0,
    )

    mc = CultivoNN()
    opt_c = optim.Adam(mc.parameters(), lr=0.01)
    loss_c = nn.MSELoss()
    tXc, tyc = torch.tensor(Xc, dtype=torch.float32), torch.tensor(yc, dtype=torch.float32)
    for _ in range(300):
        opt_c.zero_grad()
        l = loss_c(mc(tXc), tyc)
        l.backward()
        opt_c.step()
    torch.save(mc.state_dict(), "models/cultivo_nn.pt")

    # Animales: [peso, largo, cantidad, factor_animal]
    peso = np.random.uniform(1.0, 550.0, (n, 1))
    largo = np.random.uniform(20.0, 220.0, (n, 1))
    cant = np.random.uniform(1.0, 300.0, (n, 1))
    fact_a = np.random.choice(list(PRODUCTOS_ANIMAL.values()), (n, 1))

    Xa = np.hstack([peso / 500.0, largo / 220.0, np.log1p(cant) / 5.5, fact_a / 1.5])
    ya = ((peso / 500.0) * 0.45 + (largo / 220.0) * 0.35 + (fact_a / 1.5) * 0.20).clip(0.0, 1.0)

    ma = AnimalNN()
    opt_a = optim.Adam(ma.parameters(), lr=0.01)
    loss_a = nn.MSELoss()
    tXa, tya = torch.tensor(Xa, dtype=torch.float32), torch.tensor(ya, dtype=torch.float32)
    for _ in range(300):
        opt_a.zero_grad()
        la = loss_a(ma(tXa), tya)
        la.backward()
        opt_a.step()
    torch.save(ma.state_dict(), "models/animal_nn.pt")
    print("Modelos entrenados correctamente en models/")


if __name__ == "__main__":
    entrenar()