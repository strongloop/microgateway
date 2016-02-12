## CORS

#### Overview
The mapper provides a basic data transformation capability and is used
by an assembly author to configure the data values to be passed to an HTTP
or web service invocation.

#### Properties
* title: <i>string<i> (optional; default: empty)
* inputs: <i>input-list</i> (optional)
* outputs: <i>output-list</i> (optional)
* actions: <i>action-list</i> (optional)

#### JSON schema
```
id: 'http://apim.ibm.com/map'
type: object
properties:
  title:
    id: 'http://apim.ibm.com/map/title'
    type: string
  inputs:
    id: 'http://apim.ibm.com/map/inputs'
    type: object
  outputs:
    id: 'http://apim.ibm.com/map/outputs'
    type: object
  actions:
    id: 'http://apim.ibm.com/map/actions'
    type: object
required: []
```

#### Examples

```
x-ibm-configuration:
  assembly:
    execute:
      - map:
         title: Create order summary
         inputs:                                         
           - in:                                         
               variable: request.body                    
               definition: #/definitions/Order          
         outputs:                                        
           - out:                                        
               variable: message.body                    
               definition: #/definitions/OrderSummary    
         actions:                                        
           - set: out.orderNumber                        
             from: in.orderNo                            
           - set: out.ordertype                          
             value: '"web"'                              
           - set: out.orderDate                          
             value: 'new Date().toGMTString ()'          
           - create: out.orderEntries                    
             from: in.items                              
             foreach: in.items                           
             actions:                                    
               - set: itemDescription                    
                 from: description                       
               - set: itemSubtotal                       
                 from: [price, quantity]                 
                 value: '$(1) * $(2)'                    
           - set: out.orderTotal
             from: [in.items.price, in.items.quantity]
             foreach: in.items
             value: '$(0) + ($(1) * $(2))'
```
