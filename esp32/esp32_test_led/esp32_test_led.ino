const int pinoLED = 14;  // D14

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  pinMode(pinoLED, OUTPUT);
  
  Serial.println("Teste do LED iniciado!");
}

void loop() {
  digitalWrite(pinoLED, HIGH);
  Serial.println("LED ligado");
  delay(1000);
  
  digitalWrite(pinoLED, LOW);
  Serial.println("LED desligado");
  delay(1000);
}