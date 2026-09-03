class ApiLoadAction{

  constructor(getRequestConfig) {
    this.getRequestConfig = getRequestConfig;
  }
 
	/**
   * @param params API request parameters
   * @param cacheKey
   * @param requestKey
   */
  async fetch(params, cacheKey, requestKey){

    const queryConfig = this.getRequestConfig(params);

    if(!queryConfig.headers){
      queryConfig.headers = {};
    }

    const response = await ApiLoadAction.getResponseData(
      queryConfig,
    );

    if(cacheKey && requestKey){
      if(queryConfig?.method !== "GET"){
        for(let i = 0; i< sessionStorage.length; i++){
          const key = sessionStorage.key(i);
          sessionStorage.setItem(key, JSON.stringify({}));
        }
      }
        
      const data = JSON.parse(sessionStorage.getItem(cacheKey));
      data[requestKey] = response;
      sessionStorage.setItem(cacheKey, JSON.stringify(data));

    }
    return response;
  }

  static async #getErrorData(response, url) {

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      message = await response.json();
    } else {
      if (response.status === 404) {
        message = `Endpoint ${url} not found`;
      } else {
        message = await response.text();
      }
    }

    return {
      status: response.status,
      errorMessage: message,
      endpoint: url,
    };
  }

  /**
   * Directly make an API request and return the data. Use this method if the API request needs
   * to be run as part of an event handler and no other components subscribe to the request.
   * Cache data will not be used or updated.
   *
   * @param {ApiRequestConfig} queryConfig Configuration of the API request.
   */
  static async getResponseData(queryConfig){

    let authData = null;

    const data = window.localStorage.getItem("authToken");
    if(data){
      authData = JSON.parse(data).access_token;
    }
    
    if (authData) {
      if(queryConfig.headers){
        queryConfig.headers["authToken"] = authData;
      } else {
        queryConfig.headers = {
          "authToken": authData
        };
      }
    }

    try {

      //The replace call is a workaround for an issue with url strings containing double quotes.
      const response = await fetch(queryConfig.url.replace(/"/g, ""), {
        method: queryConfig.method ?? "GET",
        headers: queryConfig.headers,
        body: queryConfig.body,
      });

      if (response.status !== 200) {
        return await this.#getErrorData(response,queryConfig.url)
      }

      const contentType = response.headers.get("content-type");
      if (contentType === "application/json") {
        return await response.json();
      }

      //Clear cache because there was a likely data update.
      if(queryConfig.method !== "GET"){
       for(let i = 0; i< sessionStorage.length; i++){
          const key = sessionStorage.key(i);
          sessionStorage.setItem(key, JSON.stringify({}));
        }
      }
      return { status: 200 };
    } catch (e) {
      return {errorMessage:e.message};
    }
  }
}

class PresentationComponent {
 
  static presentationComponents = {};

  #clickTemplateEvents;
  #changeTemplateEvents;
 
  #templateSignals;

  #templateNode;

  #handlerDepthMap = {};

  //#clickHandlers;

  createClickHandler(id){
    document.getElementById(id)
      .addEventListener("click",(e)=>{

        const clickId = e.target.getAttribute("data-click-id")
                || e.target.parentNode.getAttribute("data-click-id") 
                || e.target.parentNode.parentNode.getAttribute("data-click-id") 

        if(clickId){

          const key = "data-click-id_"+clickId;
          const componentId 
            = this.getItemIdForEvent({
                "eventItem":e.target,
                "key":key});
         
          const handlerName = this.#clickTemplateEvents[clickId];
          this.clickHandlers()[handlerName]({
            "componentId":componentId
          });
        } 
    });
  }
  
  #defineComponent(){

    let template = document.createElement("template");
    let templateStr = this.defineTemplate();

    this.templateSignals = [];
 
    const clickEvents = [];
    const changeEvents = [];

    const clickHandlers = {};
    const changeHandlers = {};

    const start = Date.now();
    let i = 0;

    /* TOOD: Optimize. 
     * This logic is running in O(m*n^2) time with repetitive iteration.
     * n is the number of template items and m is the length of the template string.
     * This logic should run in O(m*n) time or better.
     */   
    const clickEventsStr = templateStr.split("onClick={{");
    if(clickEventsStr.length > 1){
      for(let i=1;i<clickEventsStr.length;i++){
        const j = clickEventsStr[i].indexOf("}}");
        
        const splitStr = clickEventsStr[i].slice(0,j);
        clickEvents.push(splitStr);
        clickEventsStr[i] = `data-click-id=${i-1}` + clickEventsStr[i].slice(j+2);
      }

      templateStr = clickEventsStr.join("");    
    }

    const changeEventsStr = templateStr.split("onChange={{");
    if(changeEventsStr.length > 1){
      for(let i=1;i<changeEventsStr.length;i++){ 
        const j = changeEventsStr[i].indexOf("}}"); 
        
        const splitStr = changeEventsStr[i].slice(0,j);
        changeEvents.push(splitStr);
        changeEventsStr[i] = `data-change-id=${i-1}` + changeEventsStr[i].slice(j+2);
      }
      templateStr = changeEventsStr.join("");
    }

    this.#changeTemplateEvents = changeEvents;
    this.#clickTemplateEvents = clickEvents;

    const signalIds = [];
  
    while(true){
      let stateVarPos = templateStr.indexOf("{{");
      if(stateVarPos === -1){
        break;
      }
     
      let firstTagEnd = templateStr.indexOf(">");
      
      const endPos = templateStr.indexOf("}}");
      const signalStr = templateStr.substring(stateVarPos+2, endPos);

      let attr, fieldName;

      if(templateStr.charAt(stateVarPos-1) === "="){
        attr = "";
        for(let j = stateVarPos-2; j > 0; j--){
          const nameChar = templateStr.charAt(j);
          if(this.isAttributeChar(nameChar)){
            attr = nameChar + attr;
          } else {
            stateVarPos = j;
            break;
          }
        }
        fieldName = signalStr;
      } else {
        attr = "innerHTML"
        fieldName = signalStr;
      }

      //Set signal for HTML and text template strings.
      let isHTML = false;
      let endTagPos = -1;

      if(attr === "innerHTML"){
        for(let j = stateVarPos -1; j >= 0; j--){
          if(templateStr.charAt(j) === ">"){

            endTagPos = j;
            isHTML = true;
            break;
          } 
        }
      }
        
      let newStr=`data-signal-id-${i}`;

      if(endPos < firstTagEnd){
        newStr = "";
      }
      
      let templateFuncType = "";
     
     
      const signalData = {
        fieldName,
        attr,
        "signalId":newStr.length > 0 ? i : -1,
        signalPath: newStr,
        isOuter: endPos < firstTagEnd
      } 

      if(!isHTML){
        if(newStr.length > 0 ){
          templateStr = templateStr.substring(0,stateVarPos) +
            newStr + templateStr.substring(endPos+2);
        } else {
          templateStr = templateStr.substring(0,stateVarPos) +
            newStr + templateStr.substring(endPos+2);
        }
      } else {
        templateStr =
          templateStr.substring(0,endTagPos) +
          " " +
          newStr +
          ">" +
          templateStr.substring(endPos+2);
      }

      this.templateSignals.push(signalData)
      i++;
    } 

    const split = templateStr.split("\n");

    const linesToAdd = [];
    for(let i=0;i<split.length;i++){

      ///Remove empty lines because they will
      //be interpreted as empty text noddes.
      if(split[i].length > 0){
        split[i]=split[i].trim();
        //Insert space for attributes
        if(!split[i].endsWith(">")) {
          split[i]=split[i]+" ";
        }
        linesToAdd.push(split[i]);
      }
    }
    templateStr = linesToAdd.join("");
    template.innerHTML = templateStr;
    
    this.templateNode = template.content.firstChild;

    const handlerAttrs = ["data-click-id","data-change-id"];

    handlerAttrs.forEach((handlerAttr)=>{
      
      const attrSelector = `[${handlerAttr}]`; 
 
      this.templateNode
        .querySelectorAll(attrSelector)
        .forEach((node)=>{

          const clickNum = node.attributes[handlerAttr].value;
          
          let depth = 0;
          while(node.parentNode.nodeName !== "#document-fragment"){
            if(node.parentNode !== null){
              node = node.parentNode;
              depth++;
            } 
          }
          const handlerDepthKey = `${handlerAttr}_${clickNum}`;
          this.#handlerDepthMap[handlerDepthKey] = depth;  
        });
    });
    
    this.templateSignals.forEach((signal)=>{
      
      // A signal id of less than one means that the data is 
      // at the root.      
      if(signal.signalId >= 0){

        const selector = `[${signal.signalPath}]`

        let childNodePath = [];
        let node = this.templateNode.querySelector(selector);
        let searchNode = node;

        while(searchNode.parentNode.nodeName !== "#document-fragment"){ 
          for(let i=0;i<searchNode.parentNode.childNodes.length;i++){ 
            if(Object.is(searchNode.parentNode.childNodes[i],searchNode)){
              childNodePath.push(`:nth-child(${i+1})`);
            }
          }
          searchNode = searchNode.parentNode;
        }

        childNodePath = childNodePath.reverse();
        node.attributes.removeNamedItem(signal.signalPath);
        signal.signalPath = childNodePath.join(">");
      }
    });

    //Tenplate parsing needs to be optimized for performance.
    //This is to display the overhead of the current logic.
    const parseTime = Date.now() - start;
    if(parseTime > 0){
      console.warn(`Slow template parse time of ${parseTime} miliseconds`);
    }
  }

  getItemIdForEvent({eventItem,key}){
    const depth = this.#handlerDepthMap[key];

    for(let i=0; i<depth;i++){
      eventItem = eventItem.parentNode;
    }
    
    return eventItem.data_id;
  }

  isAttributeChar(str){
    const code = str.charCodeAt(0);
    return (code > 64 && code < 91) || (code > 96 && code < 123)
  }
  
  static init(item){

    const obj = new item.prototype.constructor(); 
    obj.#defineComponent();

    PresentationComponent
      .presentationComponents[obj.constructor.name.toUpperCase()] = obj;
  } 
}

class PresentationItem {

  #nodes = {}

  #parentNode;
  #templateRoot = null;

  setTemplateName(templateName){
    this.templateName = templateName.toUpperCase();
  }
  
  setTemplateRoot(root){
    this.#templateRoot = root;
  }
 
  appendChild(fragment){
    this.#templateRoot.appendChild(fragment);
  }
  
  getTemplateNode(){ 
    return PresentationComponent
      .presentationComponents[this.templateName]
      .templateNode
  } 

  addNode(id,node){
    this.#nodes[id]=node;
  }

  getNode(id){
    return this.#nodes[id];
  }

  removeChild(id){
    this.#templateRoot.removeChild(this.#nodes[id]);
  }
   
  clearNodes() { 
    this.#templateRoot.replaceChildren([]);
    this.#nodes = {};
  }
}

class UserEventComponent extends HTMLElement {

  static #clickSplitRegex = new RegExp("onclick=\"{{","i");
  #handlerMap = {};
 
  constructor(){
    super();
   
    const split = this.innerHTML.split(UserEventComponent.#clickSplitRegex);
    for(let i=1; i<split.length; i++){
      const sectionSplit = split[i].split("}}");
      const handlerName = sectionSplit[0];
      split[i]=`data-${this.nodeName}-click="${handlerName}"${sectionSplit[1]}`;
    }   
    this.innerHTML = split.join("");
  }
 

  addClickEvents(handlerConfig){
 
    const clickSelectorName = `data-${this.nodeName.toLowerCase()}-click`;

    this
      .querySelectorAll(`[${clickSelectorName}]`)
      .forEach((node)=>{
        
        const eventHandlerName = node.attributes[clickSelectorName].value;

        node.id = eventHandlerName;
        node.removeAttribute(clickSelectorName);
        
        this.#handlerMap[node.id] = handlerConfig[eventHandlerName];
    });

    this.addEventListener("click",(e)=>{
      const clickId = e.target?.id;

      if(this.#handlerMap[clickId]){
        this.#handlerMap[clickId](e);
      }
    });
    
  }

}

class ContainerComponent extends HTMLElement {

  #componentIsRendering = false;
  #loadingFromStores = new Set();
  #loadingStarted = 0;
  #loadingIndicatorConfig;
 
  #changeEventListeners;
  #clickEventListeners;
  #clickEventListenersAdded = false;

  #subscribedStores = [];

  #componentStore = {};

  #presentationItems = []
  #templateLoaded = false;

  //HTML before loading animiation.
  #htmlBeforeLoading;

  #lightDomHTML = "<p>Use light DOM or render() method to show HTML</p>";


  static templateCount = 0;
  static changeTemplateEvents = {};
  static clickTemplateEvents = {};

  static changeTemplateItemHandlers = {};
  static clickTemplateItemHandlers = {};

  static clickHandlerCount = 0;
  static changeHandlerCount = 0;

	/**
	 * @param dataStoreSubscriptions - An array of data stores the component should
	 * subscribe to.
	 * indicator.
	 **/
  constructor(dataStoreSubscriptions = [], loadingIndicatorConfig) {
    super();

    //Light DOM is enabled.
    if(this.innerHTML){
      this.#lightDomHTML = this.innerHTML;
    }
   
    //Performance optimization if component is not subscribed to data stores.
    if(dataStoreSubscriptions.length === 0) {
      return;
    }
		
    // Make sure component is subscribed to data stores.
    this.#subscribedStores = dataStoreSubscriptions;
    for(let i=0;i <this.#subscribedStores.length;i++){
      this.#subscribedStores[i].dataStore.subscribeComponent(this);
    }

    this.updateFromSubscribedStores();

  }

  init(initialState){
    this.updateData(initialState);
  }
 
  #selectorCache = {};

  #generateSignal(params){

		const {
			fieldName,
			attr,
			isOuter,
			signalId,
      signalPath
		} = params.signalConfig
    
		const{ 
      signalData,
      elementRoot
		} = params.updateData;
    
    let updated = signalData[fieldName] 
    let element = elementRoot;

    if(!isOuter){       
      const cacheId = `${elementRoot.data_id}-${signalId}`;

      if(!(cacheId in this.#selectorCache)){
        element=element.querySelector(signalPath);
        this.#selectorCache[cacheId] = element;
      } else {
        element = this.#selectorCache[cacheId];
      }
    }

    if (attr === "textContent"){
      element.textContent = updated;
    } else if(attr==="innerHTML"){
      element.textContent = updated;
    } else {
      element.setAttribute(attr,`${updated}`);
    }
  }

  addChangeEventListeners(eventListeners){
    this.#changeEventListeners = eventListeners;
  }
  
 
  /**
	 * Shows custom loading indicator if it exists. This custom loading indicator
	 * replaces UI components and disables any user events.
	 **/
  lockComponent(dataStore){

    if(!this.#loadingFromStores.has(dataStore)){
      this.#loadingFromStores.add(dataStore);
    }

		// Save the timestamp for when the loading started.
    if(this.#loadingStarted === 0){
      this.#loadingStarted = Date.now();
    }

    if(this.#loadingIndicatorConfig){ 
      
      this.#htmlBeforeLoading = this.innerHTML;
      this.innerHTML = this.#loadingIndicatorConfig.generateLoadingIndicatorHtml();
    }
  }

  unlockComponent(dataStore) {
    this.#loadingFromStores.delete(dataStore);
  }

	/**
	 * Unsubscribe component when it is removed from the UI.
	 **/
  disconnectedCallback(){

    for(let i = 0; i < this.#subscribedStores.length; i++){
      this.#subscribedStores[i].dataStore.unsubscribeComponent(this);
    }
  }

  /**
	 * Update component with state data
	 **/
  updateData(storeUpdates) {
    if (storeUpdates) {
      this.#componentIsRendering = true;
      this.#componentStore = {...this.#componentStore,...storeUpdates};
      this.#generateAndSaveHTML(this.#componentStore);
      this.#componentIsRendering = false;
    }
  }
 

  updateFromSubscribedStores() {

    let allSubscribedStoresHaveData = true;
    for(let i = 0; i < this.#subscribedStores.length; i++){
      allSubscribedStoresHaveData = 
				allSubscribedStoresHaveData &&
        (this.#subscribedStores[i].dataStore.hasLatestData());
    }

		// Make sure a component state is updated only when all the subscribed
		// stores have data 
    if(allSubscribedStoresHaveData){

      let dataToUpdate = {};
      for(let i =0; i < this.#subscribedStores.length; i++){

        const item = this.#subscribedStores[i];
        let storeData = item.dataStore.getComponentUpdateData();

        if(item.componentReducer){
          storeData = item.componentReducer(storeData);
        }

        if(item.fieldName) {
          dataToUpdate[item.fieldName] = storeData;
        } else {
          dataToUpdate = storeData;
        }
      }
      this.updateData(
        dataToUpdate,
      );
    }
  }

  render(){
    return this.#lightDomHTML;
  }

  #updateSingleItemTemplate(presentationItem,state){
   
    const templateName = presentationItem.templateName;
    const prevProps = presentationItem.prevState;

    let elementRoot;

    if(Object.keys(prevProps).length === 0){

      elementRoot = presentationItem.getTemplateNode().cloneNode(true);
      
      const signalsToRun = PresentationComponent.presentationComponents[templateName].templateSignals;

      signalsToRun.forEach((signalConfig)=>{
        this.#generateSignal(
          { 
            signalConfig: signalConfig,
            updateData: {
              "signalData":state,
              "elementRoot": elementRoot,
            }
          });
      });

      const stateSlice = (state)=>{return state};
      
    } else {

      elementRoot = this.getRootNode().getElementById(presentationItem.id);
        
      if(!elementRoot){
        console.error("No id set for template");
      }   
    }

    const signalsToRun = PresentationComponent.presentationComponents[templateName].signals;

		signalsToRun.forEach((signalConfig)=>{
			
      this.#generateSignal(
        { 
          signalConfig: signalConfig,
          updateData: {
            "signalData":state,
            "elementRoot": elementRoot
          }
        });	
    });

    if(Object.keys(prevProps).length === 0){
      document.getElementById(presentationItem.id).replaceChildren(elementRoot);
    }  
  }

  //TODO: Read template by querying HTML instead of looking at presentation
  //component class.
  #setupTemplate(templateItem){
   
    console.log("Read template here");
    let attrs = [];
    const attrNames = templateItem.getAttributeNames();
    const dataFieldName = templateItem.getAttribute("data-state");
    const dataTemplateName = templateItem.getAttribute("data-component");

    for(let j=0;j<attrNames.length;j++){
      const attrName = attrNames[j]; 
      const attrValue = templateItem.getAttribute(attrName);
      if(attrName.startsWith("data")||attrValue.startsWith("data")){
        templateItem.removeAttribute(attrName);
      }
      attrs.push({
        name:attrName,
        value:attrValue
      });
    }   
    
    templateItem.id = `template-${ContainerComponent.templateCount}-${dataTemplateName}`;

    this.#renderTemplates.templateIds.push({
      "id":templateItem.id,
      "templateName":dataTemplateName
    });
 
    if(!dataFieldName){
      throw new Error(`No data field defined for template ${dataTemplateName} in component ${this.nodeName}`);
    }
   
    let presentationItem = new PresentationItem(); 
    presentationItem.id = templateItem.id;
    presentationItem.setTemplateName(dataTemplateName);
    presentationItem.attributes = attrs;

    presentationItem.dataFieldName = dataFieldName;
    presentationItem.setTemplateRoot(document.getElementById(templateItem.id));
    this.#presentationItems.push(presentationItem);

    ContainerComponent.templateCount++;

  }
  
  #renderTemplates(data,content) {

    this.#renderTemplates.templateIds = []; 
    if(!this.#presentationItems || Object.keys(this.#presentationItems).length === 0){

      const templates = content.querySelectorAll("[data-component]");
			if(!this.#presentationItems){
          this.#presentationItems = {};;
        }

      for(let i=0;i<templates.length;i++){
        this.#setupTemplate(templates[i]);  
      }

			if(this.#presentationItems.length > 0 ){
				this.#templateLoaded = true;
			}
    }

    for(let i = 0; i < this.#presentationItems.length;i++){

      const presentationItem = this.#presentationItems[i]; 
      const presentationComponent = PresentationComponent.presentationComponents[presentationItem.templateName];
      
      let state = data[presentationItem.dataFieldName] || []; 
 
      if(data?.fieldTypeMapping?.[presentationItem.dataFieldName] === "item"){ 
        this.#updateSingleItemTemplate(this.#presentationItems[i],data);  
        continue;
      }

      let hasReplaced = false;
      const added = data["added"];
      let shouldReplace = data["isReplace"];
 
      if(added && added.length >0){
 
        const signalsToRun = presentationComponent.templateSignals;
        
        if(!presentationItem.signalMapCache){
          presentationItem.signalMapCache = {};

          for(let i=0;i<signalsToRun.length;i++){
            presentationItem.signalMapCache[signalsToRun[i].fieldName] =
              signalsToRun[i];
          }
        }

        const templateNode = presentationItem.getTemplateNode();
        for(let j=0;j<added.length;j++){

          const insertBefore = added[j].insertBefore;
          const insertData = added[j].insertData;

          let addFragment = document.createDocumentFragment();
          
          for(let k=0;k<insertData.length;k++){
            const addNode = templateNode.cloneNode(true);          

            addNode.data_id = insertData[k].id;
            
            presentationItem.addNode(insertData[k].id,addNode);
            const fieldNames = Object.keys(insertData[k]);
            for(let a=0;a<fieldNames.length;a++){
                 
              this.#generateSignal(
                {
                  signalConfig:presentationItem.signalMapCache[fieldNames[a]],
                  updateData:{
                    "signalData":insertData[k],
                    "elementRoot":addNode,
                  }
                }
              )
            }
           
            addFragment.appendChild(addNode);
          }

          if(insertBefore !== -1){
            const lastNode = document.getElementById(""+insertBefore);
            lastNode.parentNode.insertBefore(addFragment);
          } else {

            presentationItem.appendChild(addFragment);
            
            if(shouldReplace){
              shouldReplace = false;
              hasReplaced = true;
            }
          }
        }
      }
      
      const removed = data["removed"];

      if(removed && removed.size > 0) { 

				if(data["isClear"] && !hasReplaced){
          presentationItem.clearNodes();
					continue;
        }

        removed.forEach((id)=>{ 
          presentationItem.removeChild(id);
        });
      }

      const moved = data["moved"] || [];

      for(let m=0;m<moved.length;m++){
        const moveNodeId = moved[m].moveNodeId;
        const moveBeforeId = moved[m].moveBeforeId;

        const nodeToMove = presentationItem.getNode(moveNodeId); 
    
        if(moveBeforeId !== null){
          
          const moveBefore = presentationItem.getNode(moveBeforeId);

          moveBefore
            .parentNode
            .insertBefore(nodeToMove,moveBefore);
        } else { 
          nodeToMove.parentNode.appendChild(nodeToMove);
        }  
      }
 
      const updates = data?.updates?.[presentationItem.dataFieldName];

      if(!updates){
        continue;
      }

      const componentConfig = PresentationComponent
          .presentationComponents[presentationItem.templateName]

      const templateSignals = componentConfig.templateSignals;
      
      if(!presentationItem.signalMapCache){
        presentationItem.signalMapCache = {};

        for(let i=0;i<templateSignals.length;i++){
          presentationItem.signalMapCache[templateSignals[i].fieldName] =
            templateSignals[i];
        }
      }

      for(let i=0;i<updates.length;i++){

        let attrName,attrValue,id;

      
        Object.keys(updates[i]).forEach((key)=>{
            if(key === "id"){
              id = updates[i][key];
            } else {
              attrName = key;
              attrValue = updates[i][key];
            }
        });
     
        if(id){
 
          const updateConfig = { 
              signalConfig: presentationItem.signalMapCache[attrName],
              updateData: {
                "signalData":{[attrName]:attrValue},
                "elementRoot": presentationItem.getNode(id)
              }
            }
         
          this.#generateSignal(updateConfig);
        } 
      }
    }
  }
 
  #initPresentationComponents(data) {
    this.#renderTemplates(data,this.getRootNode());
      this.#renderTemplates.templateIds.forEach((templateId)=>{
    
        const changeHandlers = ContainerComponent.changeTemplateEvents[templateId.templateName.toUpperCase()]

        const presentationConfig = PresentationComponent.presentationComponents[templateId.templateName.toUpperCase()];


        if(presentationConfig?.changeTemplateEvents){
          document.getElementById(templateId.id)
            .addEventListener("change",(e)=>{

              const changeId = e.target.getAttribute("data-change-id") ||
                         e.target.parentNode.getAttribute("data-change-id") ||  
                         e.target.parentNode.parentNode.getAttribute("data-change-id")

              if(changeId){

                const key = "data-change-id_"+changeId;
                const componentId 
                  = presentationConfig.getItemIdForEvent({
                      "eventItem":e.target,
                      "key":key});
               
                const handlerName = presentationConfig.changeTemplateEvents[changeId];
                presentationConfig.changeHandlers()[handlerName]({
                  "componentId":componentId
                });
             }
          });
        }
      
    });
  }
 
  #generateAndSaveHTML(data) {

    //Don't re-render static HTML if templates are being used.
    if(!this.#templateLoaded){
      if(this.#loadingStarted > 0){

        const current = Date.now();
        const loadTime = current - this.#loadingStarted;

        this.#loadingStarted = 0;
        
        //Handle case where loading indicator is configured to stay visible for a
        //minimum amount of time.
        if(this.#loadingIndicatorConfig?.minTimeMs){
          const remainingTime = this.#loadingIndicatorConfig.minTimeMs - loadTime;

          const self = this;
          if(remainingTime > 0){
            setTimeout(()=>{ 
              this.innerHTML = this.render(data);
            },remainingTime);
          } else {
            this.innerHTML = this.render(data);
          }
        } else {
          this.innerHTML = this.render(data);
        }
      }
      else {
        this.innerHTML =  this.render(data);
      }

      this.#initPresentationComponents(data);
		} else {

      if(this.#htmlBeforeLoading){
        this.innerHTML = this.#htmlBeforeLoading;  
      }
			this.#renderTemplates(data,this);
    }		
  } 
}

class ShadowDOMComponent extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: "open" });

    this.shadowRoot;
    const template = document.createElement("template");
    
    template.innerHTML = this.getTemplateStyle() + `<div></div>`;
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this.shadowRoot.querySelector("div").innerHTML = this.render(); 
  }
}

/**
 * Class to define a custom data store load action with direct control over any async calls that are made.
 * It is intended for use when additional processing needs to be done after an async call, or if a store needs
 * to combine data from multiple sources.
 */
class CustomLoadAction {
  constructor(loadFunction) {
    this.fetch = async (params) => {
      return await loadFunction(params);
    };
  }
}

class DataStore {

  static #storeCount = 0;

  static #storeRegistry = {};

  #componentSubscriptions = [];
  #isLoading = false; 
  #loadAction;
  #presentationUpdates = {};
  #presentationSignals = [];
  #reactiveFieldNames = [];
  #requestStoreId;
  #storeData = null;


  #prevOrdering = {};
  #fieldTypeMapping = {};
  
  constructor(loadAction, storeName) {
    this.#loadAction = loadAction;
    this.#componentSubscriptions = [];
    this.#requestStoreId = `store-${DataStore.#storeCount}`;
    
	  sessionStorage.setItem(this.#requestStoreId, JSON.stringify({}));

    if(!storeName){
      throw new Error("Store name not defined");
    }
    
    if(storeName in DataStore.#storeRegistry){
      throw new Error(`Invalid store name ${storeName}. Store names must be uniquie`);
    }
    DataStore.#storeRegistry[storeName] = this;

    DataStore.#storeCount++;

  }

  /**
   * Setup signals to enable fine-grained reactivity on
   * presentation components.
   */
  setupPresentationSignals(presentationSignals){
    this.#presentationSignals = presentationSignals;
  } 

  #generatePresentationUpdates(updates){

    const presentationUpdates = {}; 

    const keys = Object.keys(this.#presentationSignals);
    for(let i=0;i<keys.length;i++){

      const key = keys[i];

      const presentationField 
        = this.#presentationSignals[key]["presentationField"] || key;
      const dataToUpdate = this.#storeData[presentationField];

      if(Array.isArray(dataToUpdate)){ 
        presentationUpdates[presentationField] = {};
      } else {
        presentationUpdates[presentationField] = "";
      }
    }
  
    const signalKeys = Object.keys(this.#presentationSignals);
    for(let i=0; i<signalKeys.length;i++){
     
      const stateField = signalKeys[i]; 
      const {update,presentationField} = this.#presentationSignals[stateField];

      if(!updates[stateField]){
        continue;
      }
      if(!Array.isArray(update)){
        let changeData;

        
        if(update){
          changeData = update({
            "prevState":this.#storeData[stateField],
            "newState": updates[stateField]
          });
        } else {
          changeData = {
            param: updates[stateField]
          }
        }

        const dataToUpdate = this.#storeData[presentationField];

        if(Array.isArray(dataToUpdate)){
          for(let j=0;j<changeData.length;j++){
            const id = changeData[j].id;
            const updateVal = changeData[j].param;
            if(!presentationUpdates[presentationField][id]){
              presentationUpdates[presentationField][id] = {}; 
            }
            presentationUpdates[presentationField][id][presentationField] = updateVal;
          }
          presentationUpdates[presentationField] = changeData;
        } 
        else {
          presentationUpdates[presentationField] = changeData[param];
        }
      }

      else {

        let changeData = [];

        for(let i=0;i<updates[stateField].length;i++){

          const updateData = updates[stateField][i];
          const id = updateData.id;          
          const reactiveFields = this.#presentationSignals[stateField]["update"];
         
          for(let j=0;j<reactiveFields.length;j++){
            changeData.push({
              "id":id,
              [reactiveFields[j]]:updateData[`${reactiveFields[j]}`]
            });
          }
        }
        presentationUpdates[stateField] = changeData;
      }
    }

    return presentationUpdates;
  }

  /** 
   * Returns store data.
   * @returns A JSON object representing store data.
   */
  getStoreData() {  
    return this.#storeData; 
  }

  getComponentUpdateData(){
    if(this.#presentationSignals){
      return this.#presentationUpdates;
    }
    return this.#storeData;
  }

  /**
   * @returns {boolean} false if the data in the store is null or undefined and is not in a loading state true otherwise.
   */
  hasLatestData() {
    return this.#storeData !== null && this.#storeData !== undefined  && !this.#isLoading;
  }
  
  /**
   * Update data in the store and trigger a render of components subscribed to the store.
   * @param storeUpdates Updated store data. Fields not specified in storeData will not be updated.
   */
  updateStoreData(storeUpdates){


    //Logic that should only run if reactivity is not enabled for store
    if(!this.#presentationSignals){
      for(let i = 0; i < this.#componentSubscriptions.length; i++){
        this.#componentSubscriptions[i].updateFromSubscribedStores();
      }
      return;
    }

    let changeData = {}; 
 
    this.#presentationUpdates["removed"] = null;
    this.#presentationUpdates["added"] = null;
    this.#presentationUpdates["moved"] = null;
    this.#presentationUpdates["updated"] = null;
    this.#presentationUpdates["isClear"] = null;
    this.#presentationUpdates["isReplace"] = null;
    
    Object.keys(storeUpdates).forEach((field)=>{
           
      if(Array.isArray(storeUpdates[field])){
        
        this.#fieldTypeMapping[field] = "array";

        const dataItem = storeUpdates[field]; 
        const dataItemOld = this.#prevOrdering[field] ||[] ;
       
        const updatedOrdering = [];
      
        const prevIds = new Set();
        const newIds = new Set();

        let sameLocs = true;
        for(let num=0;num<Math.max(dataItem.length,dataItemOld.length);num++){
          if(num<dataItem.length){
            updatedOrdering.push(dataItem[num].id);
            newIds.add(dataItem[num].id);
          }
          if(num < dataItemOld.length){
            prevIds.add(dataItemOld[num]);
          }
          if(!dataItem[num] || dataItem[num].id !==dataItemOld[num]){
            sameLocs = false; 
          }
        }
       
        let isReplace = false;

        this.#presentationUpdates["removed"] = sameLocs ? new Set(): prevIds.difference(newIds);
        
        const added = sameLocs ? new Set(): newIds.difference(prevIds);
        
        if(added.size > 0){
          
          let addFragments = [];
          let addFragment = null;

          for(let num=0; num < updatedOrdering.length; num++){
            const id = updatedOrdering[num];

            if(added.has(id)){

              if(addFragment === null){
                addFragment = [];
              }
              addFragment.push(dataItem[num]);
            } else {

              if(addFragment !== null){
                addFragments.push({
                  "insertBefore":num,
                  "insertData":addFragment
                })
                addFragment = null;
              }
            }
          }
          if(addFragment !== null){
              addFragments.push({
                "insertBefore": -1,
                "insertData":addFragment,
            })
            isReplace = true;
          } 
          this.#presentationUpdates["added"] = addFragments;
          this.#prevOrdering[field]=updatedOrdering;
        }

        this.#presentationUpdates["isReplace"] = isReplace;
        this.#presentationUpdates["moved"] = [];
        
        if(!updatedOrdering || updatedOrdering.length === 0){
          this.#presentationUpdates["isClear"] = true;
        }
       
        if(this.#presentationUpdates["removed"].size > 0){

          let updatedPrev = [];
          
          for(let a=0;a<this.#storeData[field].length;a++){
            const item = this.#storeData[field][a];
            if(!this.#presentationUpdates["removed"].has(item.id)){
              updatedPrev.push(item);
            }
          }
          this.#storeData[field] = updatedPrev;
          this.#prevOrdering[field]=updatedOrdering;
        }
        const movedNodes = {}
        let sameNumber = false;
        if(!isReplace && updatedOrdering.length === this.#prevOrdering[field].length){
          sameNumber = true;

          const swapUpdates = [];
          for(let num=0;num<updatedOrdering.length;num++){

            if(updatedOrdering[num] !== this.#prevOrdering[field][num]){


              let insertBefore = null;
              if (num < updatedOrdering.length -1){
                insertBefore = updatedOrdering[num+1];
              }

              this.#presentationUpdates["moved"].push({
                moveNodeId:updatedOrdering[num],
                moveBeforeId:insertBefore
              });

              for(let a =0;a<this.#storeData[field].length;a++){
                const item = this.#storeData[field][a];

                
                if(a+1===updatedOrdering[num]){

                  if(!(updatedOrdering[num]===insertBefore-1)){
                    swapUpdates.push({
                      "updateIndex":num,
                      "updateData":item
                    })
                  }
                 
                }
              }              
            }
          }
          for(let a=swapUpdates.length-1;a>=0;a--){
            const swapItem = swapUpdates[a];
            this.#storeData[field][swapItem.updateIndex]=swapItem.updateData;
          } 

          this.#prevOrdering[field] = updatedOrdering;
        }


        if(sameNumber){
         
          const arrayChanges = [];
          const reactiveFields = this.#presentationSignals[field]["update"];

          for(let i=0;i<storeUpdates[field].length;i++){

            let oldStateRow = this.#storeData[field][i];

        
            let hasChanged = false;
            for(let j=0;j<reactiveFields.length;j++){
              const reactiveName = reactiveFields[j];
              
              const oldState = oldStateRow[reactiveName];
              const newState = storeUpdates[field][i][reactiveName];

              if(oldState !== newState){  
                hasChanged = true;
              }
            }

            if(hasChanged){
              arrayChanges.push(storeUpdates[field][i]);   
            }
          }
          changeData[field] = arrayChanges;
        }
      } else {
        this.#fieldTypeMapping[field] = "item";
        changeData[field] = storeUpdates[field];
      }
    
   });

    this.#presentationUpdates["fieldTypeMapping"] = this.#fieldTypeMapping

    this.#presentationUpdates["updates"] = this.#generatePresentationUpdates(changeData);

    Object.keys(storeUpdates).forEach((field)=>{
      this.#storeData[field] = storeUpdates[field]
    });   

    for(let i = 0; i < this.#componentSubscriptions.length; i++){
      this.#componentSubscriptions[i].updateFromSubscribedStores();
    }
 
  }

  getSubscribedComponents(){
    return this.#componentSubscriptions;
  }

  /**
   * Retrieves data from an external source.
   * @param params Parameters for the request.
   * @param dataStore Optional data store that will be subscribed to updates from this store.
   */
  async fetchData(params = {}, dataStore){

    // Do not make a data request if there is an active one in progress. The active one will push data to subscribed components.
    if(!this.#isLoading) {
      this.#isLoading = true;

      const requestConfig = this.#loadAction.getRequestConfig ? this.#loadAction.getRequestConfig(params) : {};

      let response = null;
      let requestKey = null;
      
      // Retrieve cached response if one exists.
			if(this.#requestStoreId || this.#requestStoreId.length > 0){
        requestKey = `${requestConfig.method ?? ''}_${requestConfig.url}_${JSON.stringify(requestConfig.body) ?? ''}`;
      
        const dataStr = sessionStorage.getItem(requestKey);
        if(dataStr){
          const data = JSON.parse(dataStr);

          if(!(Object.keys(data).length === 0) && requestData in data){
            response = data[requestData];
          }
        }
      }

      // Make an API call if a cached response does not exist.
      if(response === null) {
        //Replace component with loading indicator if one exists.
        for (let i = 0; i < this.#componentSubscriptions.length; i++) {
          this.#componentSubscriptions[i].lockComponent(this);
        }
        if (dataStore) {
          const dataStoreSubscribedComponents = dataStore.getSubscribedComponents();
          for (let i = 0; i < dataStoreSubscribedComponents.length; i++) {
            dataStoreSubscribedComponents[i].lockComponent(dataStore);
          }
        }
        response = await this.#loadAction.fetch(params, this.#requestStoreId,requestKey); 
      } 
      
	    this.#storeData = response;
      this.#isLoading = false;

      for(let i = 0; i < this.#componentSubscriptions.length; i++){
        this.#componentSubscriptions[i].unlockComponent(this);
        this.#componentSubscriptions[i].updateFromSubscribedStores();
      }

      if(dataStore){
        const dataStoreSubscribedComponents = dataStore.getSubscribedComponents();
        for(let i = 0; i < dataStoreSubscribedComponents.length; i++){
          dataStoreSubscribedComponents[i].unlockComponent(dataStore);
        }
        dataStore.updateStoreData(response);
      }
      return response;
    }
  }

  unsubscribeComponent(component){
    this.#componentSubscriptions.splice(this.#componentSubscriptions.indexOf(component), 1);
  }

  subscribeComponent(component){

    let i = 0;
    while(i < this.#componentSubscriptions.length){
      if(this.#componentSubscriptions[i] === component){
        this.#componentSubscriptions = this.#componentSubscriptions.splice(i, 1);
        break;
      }
      i++;
    }
    this.#componentSubscriptions.push(component);

    if(!this.hasLatestData()){
      this.fetchData();
    }
  }
}

export { ApiLoadAction, ContainerComponent, ShadowDOMComponent, CustomLoadAction, DataStore, PresentationComponent, UserEventComponent};
