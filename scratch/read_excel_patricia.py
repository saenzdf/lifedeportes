import pandas as pd
import openpyxl

def inspect_excel():
    path = "scratch/S02103_FORMATO_PEDIDO_LIFE_1__8__patricia_blanco.xlsx"
    print(f"Reading excel: {path}")
    
    # List sheets
    wb = openpyxl.load_workbook(path, read_only=True)
    print("Sheets in workbook:", wb.sheetnames)
    
    # Read the target sheet
    df = pd.read_excel(path, sheet_name="formato life")
    
    # Print the shape and columns
    print(f"Sheet shape: {df.shape}")
    print("Columns:")
    print(df.columns.tolist())
    
    # Show first 20 rows
    print("\n--- First 25 rows ---")
    pd.set_option('display.max_columns', None)
    pd.set_option('display.width', 1000)
    print(df.head(25))

if __name__ == "__main__":
    inspect_excel()
